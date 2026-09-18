"""第三方暗访任务与暗访记录业务逻辑。"""

from datetime import date, datetime, time, timedelta

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.constants import (
    MYSTERY_TASK_ACTIONS,
    MYSTERY_TASK_TRANSITIONS,
    MysteryTaskStatus,
)
from app.core.exceptions import DomainError, NotFoundError
from app.models import MysteryVisit, MysteryVisitTask, Restroom
from app.schemas.mystery import MysteryTaskCreate, MysteryTaskUpdate, MysteryVisitCreate
from app.services import restroom_service, scoring

TASK_SORTABLE_FIELDS = {
    "created_at": MysteryVisitTask.created_at,
    "start_date": MysteryVisitTask.start_date,
    "end_date": MysteryVisitTask.end_date,
    "period": MysteryVisitTask.period,
    "code": MysteryVisitTask.code,
}

VISIT_SORTABLE_FIELDS = {
    "visit_time": MysteryVisit.visit_time,
    "score": MysteryVisit.score,
    "inspector": MysteryVisit.inspector,
    "created_at": MysteryVisit.created_at,
}


def _default_period(moment: datetime | None = None) -> str:
    """按 ISO 周生成周期编号，形如 2026-W38。"""
    moment = moment or datetime.now()
    iso_year, iso_week, _ = moment.isocalendar()
    return f"{iso_year}-W{iso_week:02d}"


def _next_task_code(db: Session) -> str:
    prefix = datetime.now().strftime("AF-%Y%m")
    seq = (
        db.scalar(
            select(func.count())
            .select_from(MysteryVisitTask)
            .where(MysteryVisitTask.code.like(f"{prefix}-%"))
        )
        or 0
    ) + 1
    while True:
        code = f"{prefix}-{seq:03d}"
        if not db.scalar(select(MysteryVisitTask.id).where(MysteryVisitTask.code == code)):
            return code
        seq += 1


def _normalize_items(items: list) -> list[dict]:
    if not items:
        raise DomainError("暗访检查项不能为空")
    normalized: list[dict] = []
    seen: set[str] = set()
    for item in items:
        data = item.model_dump() if hasattr(item, "model_dump") else dict(item)
        name = str(data.get("name", "")).strip()
        if not name:
            raise DomainError("检查项名称不能为空")
        if name in seen:
            raise DomainError(f"检查项 {name} 重复提交")
        seen.add(name)
        normalized.append(
            {"name": name, "score": float(data.get("score", 0)), "remark": data.get("remark")}
        )
    return normalized


# ----------------------------- 暗访任务 -----------------------------


def get_task(db: Session, task_id: int) -> MysteryVisitTask:
    task = db.get(MysteryVisitTask, task_id)
    if task is None:
        raise NotFoundError(f"暗访任务 {task_id} 不存在")
    return task


def task_visit_count(db: Session, task_id: int) -> int:
    return (
        db.scalar(
            select(func.count()).select_from(MysteryVisit).where(MysteryVisit.task_id == task_id)
        )
        or 0
    )


def task_problem_count(db: Session, task_id: int) -> int:
    return (
        db.scalar(
            select(func.count())
            .select_from(MysteryVisit)
            .where(
                MysteryVisit.task_id == task_id,
                MysteryVisit.result == "发现问题",
            )
        )
        or 0
    )


def list_tasks(
    db: Session,
    *,
    district: str | None = None,
    status: str | None = None,
    period: str | None = None,
    inspector: str | None = None,
    keyword: str | None = None,
    page: int = 1,
    page_size: int = 10,
    sort_by: str = "created_at",
    order: str = "desc",
) -> tuple[list[MysteryVisitTask], int]:
    stmt = select(MysteryVisitTask)
    if district:
        stmt = stmt.where(MysteryVisitTask.district == district)
    if status:
        stmt = stmt.where(MysteryVisitTask.status == status)
    if period:
        stmt = stmt.where(MysteryVisitTask.period == period.strip())
    if inspector:
        stmt = stmt.where(MysteryVisitTask.inspector.like(f"%{inspector.strip()}%"))
    if keyword:
        like = f"%{keyword.strip()}%"
        stmt = stmt.where(
            or_(
                MysteryVisitTask.name.like(like),
                MysteryVisitTask.code.like(like),
                MysteryVisitTask.inspector.like(like),
            )
        )

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    column = TASK_SORTABLE_FIELDS.get(sort_by, MysteryVisitTask.created_at)
    stmt = stmt.order_by(column.desc() if order == "desc" else column.asc(), MysteryVisitTask.id.desc())
    rows = list(db.scalars(stmt.offset((page - 1) * page_size).limit(page_size)))
    return rows, total


def create_task(db: Session, payload: MysteryTaskCreate) -> MysteryVisitTask:
    start = payload.start_date
    period = (payload.period or "").strip() or _default_period(start)
    if payload.end_date and start and payload.end_date < start:
        raise DomainError("周期截止时间不能早于开始时间")
    task = MysteryVisitTask(
        code=_next_task_code(db),
        name=payload.name,
        district=payload.district.strip(),
        period=period,
        inspector=payload.inspector,
        start_date=start,
        end_date=payload.end_date,
        status=MysteryTaskStatus.PENDING.value,
        remark=payload.remark,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def update_task(db: Session, task_id: int, payload: MysteryTaskUpdate) -> MysteryVisitTask:
    task = get_task(db, task_id)
    data = payload.model_dump(exclude_unset=True)
    if task.status == MysteryTaskStatus.SUBMITTED.value:
        raise DomainError("任务已完成，不能修改")
    start = data.get("start_date", task.start_date)
    end = data.get("end_date", task.end_date)
    if start and end and end < start:
        raise DomainError("周期截止时间不能早于开始时间")
    if "district" in data and data["district"]:
        task.district = data["district"].strip()
    for key in ("name", "inspector", "start_date", "end_date", "remark"):
        if key in data:
            setattr(task, key, data[key])
    if "period" in data:
        task.period = (data["period"] or "").strip() or _default_period(task.start_date)
    db.commit()
    db.refresh(task)
    return task


def allowed_task_transitions(task: MysteryVisitTask) -> list[dict[str, str]]:
    return [
        {"status": target, "action": MYSTERY_TASK_ACTIONS.get((task.status, target), "状态变更")}
        for target in MYSTERY_TASK_TRANSITIONS.get(task.status, [])
    ]


def change_task_status(
    db: Session, task_id: int, to_status: str, operator: str, remark: str | None
) -> MysteryVisitTask:
    task = get_task(db, task_id)
    target = to_status.value if hasattr(to_status, "value") else to_status
    if target == task.status:
        raise DomainError(f"任务已处于「{target}」状态")
    allowed = MYSTERY_TASK_TRANSITIONS.get(task.status, [])
    if target not in allowed:
        raise DomainError(
            f"当前状态「{task.status}」不允许流转到「{target}」，可选："
            + ("、".join(allowed) if allowed else "无（任务已结束）")
        )
    task.status = target
    db.commit()
    db.refresh(task)
    return task


def delete_task(db: Session, task_id: int) -> None:
    task = get_task(db, task_id)
    db.delete(task)
    db.commit()


# ----------------------------- 暗访记录 -----------------------------


def get_visit(db: Session, visit_id: int) -> MysteryVisit:
    visit = db.get(MysteryVisit, visit_id)
    if visit is None:
        raise NotFoundError(f"暗访记录 {visit_id} 不存在")
    return visit


def list_visits(
    db: Session,
    *,
    task_id: int | None = None,
    restroom_id: int | None = None,
    district: str | None = None,
    inspector: str | None = None,
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
    if task_id:
        stmt = stmt.where(MysteryVisit.task_id == task_id)
    if district:
        stmt = stmt.join(Restroom, Restroom.id == MysteryVisit.restroom_id).where(
            Restroom.district == district
        )
    if restroom_id:
        stmt = stmt.where(MysteryVisit.restroom_id == restroom_id)
    if inspector:
        stmt = stmt.where(MysteryVisit.inspector.like(f"%{inspector.strip()}%"))
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
                MysteryVisit.inspector.like(like),
                MysteryVisit.problem_desc.like(like),
                MysteryVisit.remark.like(like),
                MysteryVisit.restroom_id.in_(select(Restroom.id).where(Restroom.name.like(like))),
            )
        )

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    column = VISIT_SORTABLE_FIELDS.get(sort_by, MysteryVisit.visit_time)
    stmt = stmt.order_by(column.desc() if order == "desc" else column.asc(), MysteryVisit.id.desc())
    rows = list(db.scalars(stmt.offset((page - 1) * page_size).limit(page_size)))
    return rows, total


def create_visit(db: Session, payload: MysteryVisitCreate) -> MysteryVisit:
    task = get_task(db, payload.task_id)
    if task.status == MysteryTaskStatus.CANCELLED.value:
        raise DomainError("暗访任务已取消，不能提交暗访记录")
    if task.status == MysteryTaskStatus.SUBMITTED.value:
        raise DomainError("暗访任务已完成，如需补录请先联系管理员")
    restroom = restroom_service.get_restroom(db, payload.restroom_id)
    if restroom.district != task.district:
        raise DomainError(
            f"公厕「{restroom.name}」属于区域「{restroom.district}」，"
            f"不在暗访任务区域「{task.district}」范围内"
        )

    items = _normalize_items(payload.items)
    score, grade, result = scoring.evaluate(items)
    images = [url for url in (payload.images or []) if str(url).strip()]
    problem_desc = payload.problem_desc.strip()
    if result == "发现问题" and not problem_desc:
        raise DomainError("暗访结论为「发现问题」时，必须填写问题说明")
    if result == "发现问题" and not images:
        raise DomainError("暗访结论为「发现问题」时，必须提交现场影像")

    visit = MysteryVisit(
        task_id=task.id,
        restroom_id=restroom.id,
        inspector=payload.inspector,
        visit_time=payload.visit_time or datetime.now(),
        items=items,
        score=score,
        grade=grade,
        result=result,
        images=images,
        problem_desc=problem_desc,
        remark=payload.remark,
    )
    db.add(visit)
    # 首次提交暗访记录时，待执行任务自动转为进行中
    if task.status == MysteryTaskStatus.PENDING.value:
        task.status = MysteryTaskStatus.ONGOING.value
    db.commit()
    db.refresh(visit)
    restroom_service.touch(db, restroom.id)
    return visit


def delete_visit(db: Session, visit_id: int) -> None:
    visit = get_visit(db, visit_id)
    db.delete(visit)
    db.commit()


def period_options(db: Session) -> list[str]:
    """已下发任务涉及的周期列表，供筛选下拉使用。"""
    rows = db.scalars(
        select(MysteryVisitTask.period)
        .distinct()
        .order_by(MysteryVisitTask.period.desc())
    ).all()
    return [period for period in rows if period]
