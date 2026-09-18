"""第三方暗访相关数据结构。"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.core.constants import MysteryTaskStatus
from app.schemas.inspection import InspectionItem
from app.schemas.restroom import RestroomBrief


class MysteryTaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=120, description="任务标题")
    district: str = Field(min_length=1, max_length=60, description="暗访区域")
    period: str = Field(min_length=1, max_length=20, description="暗访周期，如 2026-09")
    inspector: str = Field(min_length=1, max_length=60, description="暗访人")
    agency: str | None = Field(default=None, max_length=120, description="第三方机构")
    remark: str | None = Field(default=None, max_length=500, description="任务说明")


class MysteryTaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    district: str | None = Field(default=None, min_length=1, max_length=60)
    period: str | None = Field(default=None, min_length=1, max_length=20)
    inspector: str | None = Field(default=None, min_length=1, max_length=60)
    agency: str | None = Field(default=None, max_length=120)
    status: MysteryTaskStatus | None = Field(default=None, description="目标状态，按流转规则校验")
    remark: str | None = Field(default=None, max_length=500)


class MysteryTaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    title: str
    district: str
    period: str
    inspector: str
    agency: str = ""
    status: str
    remark: str | None = None
    created_at: datetime
    visit_count: int = 0
    avg_score: float | None = None
    problem_count: int = 0


class MysteryTaskBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    title: str
    district: str
    period: str
    inspector: str
    status: str


class MysteryVisitCreate(BaseModel):
    task_id: int = Field(description="所属暗访任务")
    restroom_id: int = Field(description="被暗访公厕")
    visit_time: datetime | None = Field(default=None, description="暗访时间，留空取当前时间")
    items: list[InspectionItem] = Field(min_length=1, description="统一评分表打分明细")
    images: list[str] = Field(default_factory=list, description="现场影像链接")
    problem_note: str | None = Field(default=None, max_length=1000, description="问题说明")


class MysteryVisitUpdate(BaseModel):
    visit_time: datetime | None = None
    items: list[InspectionItem] | None = Field(default=None, min_length=1)
    images: list[str] | None = None
    problem_note: str | None = Field(default=None, max_length=1000)


class MysteryVisitOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    task_id: int
    task: MysteryTaskBrief | None = None
    restroom_id: int
    restroom: RestroomBrief | None = None
    visit_time: datetime
    items: list[InspectionItem] = Field(default_factory=list)
    score: float
    grade: str
    result: str
    images: list[str] = Field(default_factory=list)
    problem_note: str | None = None
    created_at: datetime
    issue_count: int = 0


class MysteryDistrictStat(BaseModel):
    district: str
    visit_count: int = 0
    avg_score: float = 0.0
    problem_count: int = 0


class MysteryStats(BaseModel):
    """第三方暗访独立统计，与内部巡查得分分开计算。"""

    task_total: int = 0
    task_running: int = 0
    visit_total: int = 0
    avg_score: float = 0.0
    problem_visit_total: int = 0
    issue_total: int = 0
    issue_open: int = 0
    by_district: list[MysteryDistrictStat] = Field(default_factory=list)
