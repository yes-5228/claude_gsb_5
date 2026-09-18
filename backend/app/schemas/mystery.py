"""第三方暗访任务与暗访记录相关数据结构。"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.core.constants import MysteryTaskStatus
from app.schemas.restroom import RestroomBrief


class MysteryTaskBase(BaseModel):
    name: str = Field(min_length=1, max_length=120, description="任务名称")
    district: str = Field(min_length=1, max_length=60, description="暗访区域")
    period: str | None = Field(default=None, max_length=20, description="暗访周期，留空按开始时间所在周生成")
    inspector: str = Field(default="", max_length=60, description="暗访人 / 第三方机构")
    start_date: datetime | None = Field(default=None, description="周期开始时间")
    end_date: datetime | None = Field(default=None, description="周期截止时间")
    remark: str | None = Field(default=None, max_length=500, description="任务说明")


class MysteryTaskCreate(MysteryTaskBase):
    pass


class MysteryTaskUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    district: str | None = Field(default=None, min_length=1, max_length=60)
    period: str | None = Field(default=None, max_length=20)
    inspector: str | None = Field(default=None, max_length=60)
    start_date: datetime | None = None
    end_date: datetime | None = None
    remark: str | None = Field(default=None, max_length=500)


class MysteryTaskStatusUpdate(BaseModel):
    """一次暗访任务状态流转操作。"""

    to_status: MysteryTaskStatus = Field(description="目标状态")
    operator: str = Field(min_length=1, max_length=60, description="操作人")
    remark: str | None = Field(default=None, max_length=500, description="处理说明")


class MysteryVisitItem(BaseModel):
    """单个检查项的打分，与内部巡查使用统一评分表。"""

    name: str = Field(description="检查项名称")
    score: float = Field(ge=0, le=10, description="得分，0-10")
    remark: str | None = Field(default=None, max_length=200, description="单项备注")


class MysteryVisitBrief(BaseModel):
    """问题引用暗访记录时的精简信息。"""

    model_config = ConfigDict(from_attributes=True)

    id: int
    task_id: int
    inspector: str
    visit_time: datetime
    score: float
    grade: str
    result: str


class MysteryVisitCreate(BaseModel):
    task_id: int = Field(description="所属暗访任务")
    restroom_id: int = Field(description="被暗访公厕")
    inspector: str = Field(min_length=1, max_length=60, description="暗访人")
    visit_time: datetime | None = Field(default=None, description="暗访时间，留空取当前时间")
    items: list[MysteryVisitItem] = Field(min_length=1, description="检查项打分明细")
    images: list[str] = Field(default_factory=list, description="现场影像链接")
    problem_desc: str = Field(default="", max_length=1000, description="问题说明")
    remark: str | None = Field(default=None, max_length=500, description="暗访备注")


class MysteryVisitOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    task_id: int
    restroom_id: int
    restroom: RestroomBrief | None = None
    inspector: str
    visit_time: datetime
    items: list[MysteryVisitItem] = Field(default_factory=list)
    score: float
    grade: str
    result: str
    images: list[str] = Field(default_factory=list)
    problem_desc: str = ""
    remark: str | None = None
    created_at: datetime
    issue_count: int = 0


class MysteryTaskOut(MysteryTaskBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    status: str
    period: str = ""
    created_at: datetime
    updated_at: datetime
    visit_count: int = 0
    problem_count: int = 0


class MysteryTaskDetail(MysteryTaskOut):
    """任务详情，附带任务下的全部暗访记录。"""

    visits: list[MysteryVisitOut] = Field(default_factory=list)
