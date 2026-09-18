"""第三方暗访任务与暗访记录业务逻辑。"""

from datetime import date, datetime, time

from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session

from app.core.constants import (
    MYSTERY_TASK_TRANSITIONS,
    OPEN_ISSUE_STATUSES,
    InspectionResult,
    MysteryTaskStatus,
)
from app.core.exceptions import ConflictError, DomainError, NotFoundError
from app.models import Issue, MysteryTask, MysteryVisit, Restroom
from app.schemas.mystery import (
    MysteryDistrictStat,
    MysteryStats,
    MysteryTaskCreate,
    MysteryTaskOut,
    MysteryTaskUpdate,
    MysteryVisitCreate,
    MysteryVisitOut,
    MysteryVisitUpdate,
)
from app.services import inspection_service, restroom_service, scoring

TASK_SORTABLE_FIELDS = {
    "created_at": MysteryTask.created_at,
    "period": MysteryTask.period,
    "district": MysteryTask.district,
}

VISIT_SORTABLE_FIELDS = {
    "visit_time": MysteryVisit.visit_time,
    "score": MysteryVisit.score,
    "created_at": MysteryVisit.created_at,
}


def _next_task_code(db: Session) -> str:
    """生成形如 AF-20260918-001 的暗访任务编号。"""
    prefix = datetime.now().strftime("AF-%Y%m%d")
    seq = (
        db.scalar(
            select(func.count()).select_from(MysteryTask).where(MysteryTask.code.like(f"{prefix}-%"))
        )
        or 0
    ) + 1
    while True:
        code = f"{prefix}-{seq:03d}"
        if not db.scalar(select(MysteryTask.id).where(MysteryTask.code == code)):
            return code
        seq += 1


# ---------------------------------------------------------------- 任务

def get_task(db: Session, task_id: int) -> MysteryTask:
    task = db.get(MysteryTask, task_id)
    if task is None:
        raise NotFoundError(f"暗访任务 {task_id} 不存在")
    return task


def task_to_out(task: MysteryTask) -> MysteryTaskOut:
    data = MysteryTaskOut.model_validate(task)
    scores = [visit.score for visit in task.visits]
    data.visit_count = len(scores)
    data.avg_score = round(sum(scores) / len(scores), 1) if scores else None
    data.problem_count = sum(
        1 for visit in task.visits if visit.result == InspectionResult.ABNORMAL.value
    )
    return data


def list_tasks(
    db: Session,
    *,
    district: str | None = None,
    status: str | None = None,
    period: str | None = None,
    keyword: str | None = None,
    page: int = 1,
    page_size: int = 10,
    sort_by: str = "created_at",
    order: str = "desc",
) -> tuple[list[MysteryTask], int]:
    stmt = select(MysteryTask)
    if district:
        stmt = stmt.where(MysteryTask.district == district)
    if status:
        stmt = stmt.where(MysteryTask.status == status)
    if period:
        stmt = stmt.where(MysteryTask.period == period.strip())
    if keyword:
        like = f"%{keyword.strip()}%"
        stmt = stmt.where(
            or_(
                MysteryTask.title.like(like),
                MysteryTask.code.like(like),
                MysteryTask.inspector.like(like),
                MysteryTask.agency.like(like),
            )
        )

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    column = TASK_SORTABLE_FIELDS.get(sort_by, MysteryTask.created_at)
    stmt = stmt.order_by(column.desc() if order == "desc" else column.asc(), MysteryTask.id.desc())
    rows = list(db.scalars(stmt.offset((page - 1) * page_size).limit(page_size)))
    return rows, total


def create_task(db: Session, payload: MysteryTaskCreate) -> MysteryTask:
    task = MysteryTask(
        code=_next_task_code(db),
        title=payload.title.strip(),
        district=payload.district.strip(),
        period=payload.period.strip(),
        inspector=payload.inspector.strip(),
        agency=(payload.agency or "").strip(),
        status=MysteryTaskStatus.PENDING.value,
        remark=payload.remark,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def update_task(db: Session, task_id: int, payload: MysteryTaskUpdate) -> MysteryTask:
    task = get_task(db, task_id)
    data = payload.model_dump(exclude_unset=True)

    target = data.pop("status", None)
    if target is not None:
        target_value = target.value if hasattr(target, "value") else target
        if target_value != task.status:
            allowed = MYSTERY_TASK_TRANSITIONS.get(task.status, [])
            if target_value not in allowed:
                raise DomainError(
                    f"任务当前状态「{task.status}」不允许流转到「{target_value}」，可选："
                    + ("、".join(allowed) if allowed else "无（流程已结束）")
                )
            task.status = target_value

    for key, value in data.items():
        setattr(task, key, value)
    db.commit()
    db.refresh(task)
    return task


def delete_task(db: Session, task_id: int, *, force: bool = False) -> None:
    task = get_task(db, task_id)
    visit_count = len(task.visits)
    if visit_count and not force:
        raise ConflictError(
            f"该任务已有 {visit_count} 条暗访记录，确需删除请使用 force=true"
        )
    db.delete(task)
    db.commit()


# ---------------------------------------------------------------- 暗访记录

def get_visit(db: Session, visit_id: int) -> MysteryVisit:
    visit = db.get(MysteryVisit, visit_id)
    if visit is None:
        raise NotFoundError(f"暗访记录 {visit_id} 不存在")
    return visit


def visit_to_out(visit: MysteryVisit) -> MysteryVisitOut:
    data = MysteryVisitOut.model_validate(visit)
    data.issue_count = len(visit.issues)
    return data


def list_visits(
    db: Session,
    *,
    task_id: int | None = None,
    restroom_id: int | None = None,
    district: str | None = None,
    result: str | None = None,
    keyword: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    page: int = 1,
    page_size: int = 10,
    sort_by: str = "visit_time",
    order: str = "desc",
) -> tuple[list[MysteryVisit], int]:
    stmt = select(MysteryVisit)
    if district:
        stmt = stmt.join(Restroom, Restroom.id == MysteryVisit.restroom_id).where(
            Restroom.district == district
        )
    if task_id:
        stmt = stmt.where(MysteryVisit.task_id == task_id)
    if restroom_id:
        stmt = stmt.where(MysteryVisit.restroom_id == restroom_id)
    if result:
        stmt = stmt.where(MysteryVisit.result == result)
    if date_from:
        stmt = stmt.where(MysteryVisit.visit_time >= datetime.combine(date_from, time.min))
    if date_to:
        stmt = stmt.where(MysteryVisit.visit_time <= datetime.combine(date_to, time.max))
    if keyword:
        like = f"%{keyword.strip()}%"
        stmt = stmt.where(
            or_(
                MysteryVisit.problem_note.like(like),
                MysteryVisit.restroom_id.in_(
                    select(Restroom.id).where(Restroom.name.like(like))
                ),
                MysteryVisit.task_id.in_(
                    select(MysteryTask.id).where(MysteryTask.title.like(like))
                ),
            )
        )

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    column = VISIT_SORTABLE_FIELDS.get(sort_by, MysteryVisit.visit_time)
    stmt = stmt.order_by(column.desc() if order == "desc" else column.asc(), MysteryVisit.id.desc())
    rows = list(db.scalars(stmt.offset((page - 1) * page_size).limit(page_size)))
    return rows, total


def create_visit(db: Session, payload: MysteryVisitCreate) -> MysteryVisit:
    task = get_task(db, payload.task_id)
    if task.status in (MysteryTaskStatus.DONE.value, MysteryTaskStatus.CANCELLED.value):
        raise DomainError(f"任务「{task.title}」已{task.status}，无法提交暗访记录")
    restroom = restroom_service.get_restroom(db, payload.restroom_id)
    if restroom.district != task.district:
        raise DomainError(
            f"公厕「{restroom.name}」属于{restroom.district}，不在任务区域「{task.district}」内"
        )

    items = inspection_service.normalize_items(payload.items)
    score, grade, result = scoring.evaluate(items)
    visit = MysteryVisit(
        task_id=task.id,
        restroom_id=restroom.id,
        visit_time=payload.visit_time or datetime.now(),
        items=items,
        score=score,
        grade=grade,
        result=result,
        images=[str(url).strip() for url in payload.images if str(url).strip()],
        problem_note=payload.problem_note,
    )
    # 首条暗访记录提交后，任务自动进入「进行中」
    if task.status == MysteryTaskStatus.PENDING.value:
        task.status = MysteryTaskStatus.RUNNING.value
    db.add(visit)
    db.commit()
    db.refresh(visit)
    restroom_service.touch(db, restroom.id)
    return visit


def update_visit(db: Session, visit_id: int, payload: MysteryVisitUpdate) -> MysteryVisit:
    visit = get_visit(db, visit_id)
    data = payload.model_dump(exclude_unset=True)
    if data.get("items") is not None:
        items = inspection_service.normalize_items(payload.items or [])
        score, grade, result = scoring.evaluate(items)
        visit.items = items
        visit.score = score
        visit.grade = grade
        visit.result = result
    if data.get("visit_time") is not None and payload.visit_time is not None:
        visit.visit_time = payload.visit_time
    if data.get("images") is not None and payload.images is not None:
        visit.images = [str(url).strip() for url in payload.images if str(url).strip()]
    if "problem_note" in data:
        visit.problem_note = payload.problem_note
    db.commit()
    db.refresh(visit)
    return visit


def delete_visit(db: Session, visit_id: int) -> None:
    visit = get_visit(db, visit_id)
    db.delete(visit)
    db.commit()


# ---------------------------------------------------------------- 独立统计

def stats(db: Session) -> MysteryStats:
    """第三方暗访独立统计，与内部保洁巡查得分分开计算。"""
    task_total = db.scalar(select(func.count()).select_from(MysteryTask)) or 0
    task_running = db.scalar(
        select(func.count())
        .select_from(MysteryTask)
        .where(MysteryTask.status == MysteryTaskStatus.RUNNING.value)
    ) or 0
    visit_total = db.scalar(select(func.count()).select_from(MysteryVisit)) or 0
    avg_score = db.scalar(select(func.avg(MysteryVisit.score))) or 0.0
    problem_visit_total = db.scalar(
        select(func.count())
        .select_from(MysteryVisit)
        .where(MysteryVisit.result == InspectionResult.ABNORMAL.value)
    ) or 0
    issue_total = db.scalar(
        select(func.count()).select_from(Issue).where(Issue.mystery_visit_id.is_not(None))
    ) or 0
    issue_open = db.scalar(
        select(func.count())
        .select_from(Issue)
        .where(Issue.mystery_visit_id.is_not(None), Issue.status.in_(OPEN_ISSUE_STATUSES))
    ) or 0

    district_rows = db.execute(
        select(
            Restroom.district,
            func.count(MysteryVisit.id),
            func.avg(MysteryVisit.score),
            func.sum(case((MysteryVisit.result == InspectionResult.ABNORMAL.value, 1), else_=0)),
        )
        .join(Restroom, Restroom.id == MysteryVisit.restroom_id)
        .group_by(Restroom.district)
    ).all()
    by_district = [
        MysteryDistrictStat(
            district=district,
            visit_count=int(count),
            avg_score=round(float(avg or 0), 1),
            problem_count=int(problems or 0),
        )
        for district, count, avg, problems in district_rows
    ]
    by_district.sort(key=lambda item: (item.problem_count, -item.avg_score), reverse=True)

    return MysteryStats(
        task_total=task_total,
        task_running=task_running,
        visit_total=visit_total,
        avg_score=round(float(avg_score), 1),
        problem_visit_total=problem_visit_total,
        issue_total=issue_total,
        issue_open=issue_open,
        by_district=by_district,
    )
