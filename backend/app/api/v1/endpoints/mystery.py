"""第三方暗访任务与暗访记录接口。"""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import PaginationDep, build_meta
from app.core.database import get_db
from app.schemas.common import MessageOut, Page
from app.schemas.mystery import (
    MysteryTaskCreate,
    MysteryTaskDetail,
    MysteryTaskOut,
    MysteryTaskStatusUpdate,
    MysteryTaskUpdate,
    MysteryVisitCreate,
    MysteryVisitOut,
)
from app.services import mystery_service

router = APIRouter(prefix="/mystery-tasks", tags=["第三方暗访"])


class TaskTransitionOption(BaseModel):
    status: str
    action: str


def _task_out(db, task) -> MysteryTaskOut:
    out = MysteryTaskOut.model_validate(task)
    out.visit_count = mystery_service.task_visit_count(db, task.id)
    out.problem_count = mystery_service.task_problem_count(db, task.id)
    return out


@router.get("", response_model=Page[MysteryTaskOut], summary="暗访任务列表")
def list_tasks(
    db: Annotated[Session, Depends(get_db)],
    pagination: PaginationDep,
    district: Annotated[str | None, Query(description="按区域过滤")] = None,
    status: Annotated[str | None, Query(description="任务状态")] = None,
    period: Annotated[str | None, Query(description="暗访周期")] = None,
    inspector: Annotated[str | None, Query(description="暗访人/机构")] = None,
    keyword: Annotated[str | None, Query(description="任务名称/编号/暗访人模糊搜索")] = None,
    sort_by: Annotated[str, Query(description="排序字段")] = "created_at",
    order: Annotated[str, Query(pattern="^(asc|desc)$")] = "desc",
) -> Page[MysteryTaskOut]:
    rows, total = mystery_service.list_tasks(
        db,
        district=district,
        status=status,
        period=period,
        inspector=inspector,
        keyword=keyword,
        page=pagination.page,
        page_size=pagination.page_size,
        sort_by=sort_by,
        order=order,
    )
    return Page[MysteryTaskOut](
        items=[_task_out(db, row) for row in rows],
        meta=build_meta(total, pagination),
    )


@router.post("", response_model=MysteryTaskOut, status_code=201, summary="按区域与周期下发暗访任务")
def create_task(
    payload: MysteryTaskCreate, db: Annotated[Session, Depends(get_db)]
) -> MysteryTaskOut:
    task = mystery_service.create_task(db, payload)
    return _task_out(db, task)


@router.get("/periods", response_model=list[str], summary="暗访周期列表")
def list_periods(db: Annotated[Session, Depends(get_db)]) -> list[str]:
    return mystery_service.period_options(db)


@router.get("/{task_id}", response_model=MysteryTaskDetail, summary="暗访任务详情")
def get_task(task_id: int, db: Annotated[Session, Depends(get_db)]) -> MysteryTaskDetail:
    task = mystery_service.get_task(db, task_id)
    visits = list(task.visits)
    detail = MysteryTaskDetail.model_validate(task)
    detail.visit_count = len(visits)
    detail.problem_count = sum(1 for visit in visits if visit.result == "发现问题")
    detail.visits = [visit_to_out(visit) for visit in visits]
    return detail


@router.patch("/{task_id}", response_model=MysteryTaskOut, summary="更新暗访任务")
def update_task(
    task_id: int, payload: MysteryTaskUpdate, db: Annotated[Session, Depends(get_db)]
) -> MysteryTaskOut:
    task = mystery_service.update_task(db, task_id, payload)
    return _task_out(db, task)


@router.get("/{task_id}/transitions", response_model=list[TaskTransitionOption], summary="任务可执行动作")
def list_task_transitions(
    task_id: int, db: Annotated[Session, Depends(get_db)]
) -> list[TaskTransitionOption]:
    task = mystery_service.get_task(db, task_id)
    return [
        TaskTransitionOption(**option)
        for option in mystery_service.allowed_task_transitions(task)
    ]


@router.post("/{task_id}/transitions", response_model=MysteryTaskOut, summary="推进暗访任务状态")
def change_task_status(
    task_id: int, payload: MysteryTaskStatusUpdate, db: Annotated[Session, Depends(get_db)]
) -> MysteryTaskOut:
    task = mystery_service.change_task_status(
        db, task_id, payload.to_status, payload.operator, payload.remark
    )
    return _task_out(db, task)


@router.delete("/{task_id}", response_model=MessageOut, summary="删除暗访任务")
def delete_task(task_id: int, db: Annotated[Session, Depends(get_db)]) -> MessageOut:
    mystery_service.delete_task(db, task_id)
    return MessageOut(message="删除成功")


# ----------------------------- 暗访记录 -----------------------------


def visit_to_out(visit) -> MysteryVisitOut:
    out = MysteryVisitOut.model_validate(visit)
    out.issue_count = len(visit.issues)
    return out


visit_router = APIRouter(prefix="/mystery-visits", tags=["第三方暗访"])


@visit_router.get("", response_model=Page[MysteryVisitOut], summary="暗访记录列表")
def list_visits(
    db: Annotated[Session, Depends(get_db)],
    pagination: PaginationDep,
    task_id: Annotated[int | None, Query(description="按暗访任务过滤")] = None,
    restroom_id: Annotated[int | None, Query(description="按公厕过滤")] = None,
    district: Annotated[str | None, Query(description="按区域过滤")] = None,
    inspector: Annotated[str | None, Query(description="暗访人")] = None,
    result: Annotated[str | None, Query(description="暗访结论")] = None,
    keyword: Annotated[str | None, Query(description="公厕名称/问题说明模糊搜索")] = None,
    date_from: Annotated[date | None, Query(description="开始日期")] = None,
    date_to: Annotated[date | None, Query(description="结束日期")] = None,
    sort_by: Annotated[str, Query(description="排序字段")] = "visit_time",
    order: Annotated[str, Query(pattern="^(asc|desc)$")] = "desc",
) -> Page[MysteryVisitOut]:
    rows, total = mystery_service.list_visits(
        db,
        task_id=task_id,
        restroom_id=restroom_id,
        district=district,
        inspector=inspector,
        result=result,
        keyword=keyword,
        date_from=date_from,
        date_to=date_to,
        page=pagination.page,
        page_size=pagination.page_size,
        sort_by=sort_by,
        order=order,
    )
    return Page[MysteryVisitOut](
        items=[visit_to_out(row) for row in rows],
        meta=build_meta(total, pagination),
    )


@visit_router.post("", response_model=MysteryVisitOut, status_code=201, summary="提交暗访打分与现场影像")
def create_visit(
    payload: MysteryVisitCreate, db: Annotated[Session, Depends(get_db)]
) -> MysteryVisitOut:
    visit = mystery_service.create_visit(db, payload)
    return visit_to_out(visit)


@visit_router.get("/{visit_id}", response_model=MysteryVisitOut, summary="暗访记录详情")
def get_visit(visit_id: int, db: Annotated[Session, Depends(get_db)]) -> MysteryVisitOut:
    return visit_to_out(mystery_service.get_visit(db, visit_id))


@visit_router.delete("/{visit_id}", response_model=MessageOut, summary="删除暗访记录")
def delete_visit(visit_id: int, db: Annotated[Session, Depends(get_db)]) -> MessageOut:
    mystery_service.delete_visit(db, visit_id)
    return MessageOut(message="删除成功")
