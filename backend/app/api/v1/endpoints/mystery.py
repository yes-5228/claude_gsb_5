"""第三方暗访接口：任务下发、暗访记录与独立统计。"""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import PaginationDep, build_meta
from app.core.database import get_db
from app.schemas.common import MessageOut, Page
from app.schemas.mystery import (
    MysteryStats,
    MysteryTaskCreate,
    MysteryTaskOut,
    MysteryTaskUpdate,
    MysteryVisitCreate,
    MysteryVisitOut,
    MysteryVisitUpdate,
)
from app.services import mystery_service

router = APIRouter(prefix="/mystery", tags=["第三方暗访"])


# ---------------------------------------------------------------- 暗访任务

@router.get("/tasks", response_model=Page[MysteryTaskOut], summary="暗访任务列表")
def list_tasks(
    db: Annotated[Session, Depends(get_db)],
    pagination: PaginationDep,
    district: Annotated[str | None, Query(description="按区域过滤")] = None,
    status: Annotated[str | None, Query(description="任务状态")] = None,
    period: Annotated[str | None, Query(description="暗访周期，如 2026-09")] = None,
    keyword: Annotated[str | None, Query(description="标题/编号/暗访人模糊搜索")] = None,
    sort_by: Annotated[str, Query(description="排序字段")] = "created_at",
    order: Annotated[str, Query(pattern="^(asc|desc)$")] = "desc",
) -> Page[MysteryTaskOut]:
    rows, total = mystery_service.list_tasks(
        db,
        district=district,
        status=status,
        period=period,
        keyword=keyword,
        page=pagination.page,
        page_size=pagination.page_size,
        sort_by=sort_by,
        order=order,
    )
    return Page[MysteryTaskOut](
        items=[mystery_service.task_to_out(row) for row in rows],
        meta=build_meta(total, pagination),
    )


@router.post("/tasks", response_model=MysteryTaskOut, status_code=201, summary="下发暗访任务")
def create_task(
    payload: MysteryTaskCreate, db: Annotated[Session, Depends(get_db)]
) -> MysteryTaskOut:
    return mystery_service.task_to_out(mystery_service.create_task(db, payload))


@router.get("/tasks/{task_id}", response_model=MysteryTaskOut, summary="暗访任务详情")
def get_task(task_id: int, db: Annotated[Session, Depends(get_db)]) -> MysteryTaskOut:
    return mystery_service.task_to_out(mystery_service.get_task(db, task_id))


@router.patch("/tasks/{task_id}", response_model=MysteryTaskOut, summary="更新暗访任务/状态流转")
def update_task(
    task_id: int, payload: MysteryTaskUpdate, db: Annotated[Session, Depends(get_db)]
) -> MysteryTaskOut:
    return mystery_service.task_to_out(mystery_service.update_task(db, task_id, payload))


@router.delete("/tasks/{task_id}", response_model=MessageOut, summary="删除暗访任务")
def delete_task(
    task_id: int,
    db: Annotated[Session, Depends(get_db)],
    force: Annotated[bool, Query(description="存在暗访记录时强制级联删除")] = False,
) -> MessageOut:
    mystery_service.delete_task(db, task_id, force=force)
    return MessageOut(message="删除成功")


# ---------------------------------------------------------------- 暗访记录

@router.get("/visits", response_model=Page[MysteryVisitOut], summary="暗访记录列表")
def list_visits(
    db: Annotated[Session, Depends(get_db)],
    pagination: PaginationDep,
    task_id: Annotated[int | None, Query(description="按任务过滤")] = None,
    restroom_id: Annotated[int | None, Query(description="按公厕过滤")] = None,
    district: Annotated[str | None, Query(description="按区域过滤")] = None,
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
        items=[mystery_service.visit_to_out(row) for row in rows],
        meta=build_meta(total, pagination),
    )


@router.post("/visits", response_model=MysteryVisitOut, status_code=201, summary="提交暗访记录")
def create_visit(
    payload: MysteryVisitCreate, db: Annotated[Session, Depends(get_db)]
) -> MysteryVisitOut:
    return mystery_service.visit_to_out(mystery_service.create_visit(db, payload))


@router.get("/visits/{visit_id}", response_model=MysteryVisitOut, summary="暗访记录详情")
def get_visit(visit_id: int, db: Annotated[Session, Depends(get_db)]) -> MysteryVisitOut:
    return mystery_service.visit_to_out(mystery_service.get_visit(db, visit_id))


@router.patch("/visits/{visit_id}", response_model=MysteryVisitOut, summary="更新暗访记录")
def update_visit(
    visit_id: int, payload: MysteryVisitUpdate, db: Annotated[Session, Depends(get_db)]
) -> MysteryVisitOut:
    return mystery_service.visit_to_out(mystery_service.update_visit(db, visit_id, payload))


@router.delete("/visits/{visit_id}", response_model=MessageOut, summary="删除暗访记录")
def delete_visit(visit_id: int, db: Annotated[Session, Depends(get_db)]) -> MessageOut:
    mystery_service.delete_visit(db, visit_id)
    return MessageOut(message="删除成功")


# ---------------------------------------------------------------- 独立统计

@router.get("/stats", response_model=MysteryStats, summary="第三方暗访独立统计")
def get_stats(db: Annotated[Session, Depends(get_db)]) -> MysteryStats:
    return mystery_service.stats(db)
