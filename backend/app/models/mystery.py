"""第三方暗访模型：暗访任务（按区域与周期下发）与暗访记录。"""

from datetime import datetime

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.constants import MysteryTaskStatus
from app.core.database import Base


class MysteryVisitTask(Base):
    """按区域与周期下发给第三方暗访人的暗访任务。"""

    __tablename__ = "mystery_visit_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True, index=True, comment="任务编号")
    name: Mapped[str] = mapped_column(String(120), comment="任务名称")
    district: Mapped[str] = mapped_column(String(60), index=True, comment="暗访区域")
    period: Mapped[str] = mapped_column(String(20), index=True, comment="暗访周期，如 2026-W38 / 2026-09")
    inspector: Mapped[str] = mapped_column(String(60), default="", index=True, comment="暗访人/机构")
    start_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, comment="周期开始时间")
    end_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, comment="周期截止时间")
    status: Mapped[str] = mapped_column(
        String(20), default=MysteryTaskStatus.PENDING.value, index=True, comment="任务状态"
    )
    remark: Mapped[str | None] = mapped_column(Text, nullable=True, comment="任务说明")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.now, onupdate=datetime.now
    )

    visits: Mapped[list["MysteryVisit"]] = relationship(
        back_populates="task", cascade="all, delete-orphan"
    )


class MysteryVisit(Base):
    """一次第三方暗访的结果，按与内部巡查统一的评分表打分。"""

    __tablename__ = "mystery_visits"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    task_id: Mapped[int] = mapped_column(
        ForeignKey("mystery_visit_tasks.id", ondelete="CASCADE"), index=True, comment="所属暗访任务"
    )
    restroom_id: Mapped[int] = mapped_column(
        ForeignKey("restrooms.id", ondelete="CASCADE"), index=True, comment="被暗访公厕"
    )
    inspector: Mapped[str] = mapped_column(String(60), index=True, comment="暗访人")
    visit_time: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.now, index=True, comment="暗访时间"
    )
    items: Mapped[list[dict]] = mapped_column(JSON, default=list, comment="检查项打分明细")
    score: Mapped[float] = mapped_column(Float, default=0.0, comment="暗访得分")
    grade: Mapped[str] = mapped_column(String(20), default="", comment="评分等级")
    result: Mapped[str] = mapped_column(String(20), default="", index=True, comment="暗访结论")
    images: Mapped[list[str]] = mapped_column(JSON, default=list, comment="现场影像链接")
    problem_desc: Mapped[str] = mapped_column(Text, default="", comment="问题说明")
    remark: Mapped[str | None] = mapped_column(Text, nullable=True, comment="暗访备注")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    task: Mapped["MysteryVisitTask"] = relationship(back_populates="visits")
    restroom: Mapped["Restroom"] = relationship(back_populates="mystery_visits")  # noqa: F821
    issues: Mapped[list["Issue"]] = relationship(back_populates="mystery_visit")  # noqa: F821
