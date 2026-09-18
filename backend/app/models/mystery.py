"""第三方暗访任务与暗访记录模型。"""

from datetime import datetime

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.constants import MysteryTaskStatus
from app.core.database import Base


class MysteryTask(Base):
    """一次按区域与周期下发的第三方暗访任务。"""

    __tablename__ = "mystery_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True, index=True, comment="任务编号")
    title: Mapped[str] = mapped_column(String(120), comment="任务标题")
    district: Mapped[str] = mapped_column(String(60), index=True, comment="暗访区域")
    period: Mapped[str] = mapped_column(String(20), index=True, comment="暗访周期，如 2026-09")
    inspector: Mapped[str] = mapped_column(String(60), comment="暗访人")
    agency: Mapped[str] = mapped_column(String(120), default="", comment="第三方机构")
    status: Mapped[str] = mapped_column(
        String(20), default=MysteryTaskStatus.PENDING.value, index=True, comment="任务状态"
    )
    remark: Mapped[str | None] = mapped_column(Text, nullable=True, comment="任务说明")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, comment="下发时间")

    visits: Mapped[list["MysteryVisit"]] = relationship(
        back_populates="task", cascade="all, delete-orphan"
    )


class MysteryVisit(Base):
    """暗访人按统一评分表提交的一次现场暗访记录。"""

    __tablename__ = "mystery_visits"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    task_id: Mapped[int] = mapped_column(
        ForeignKey("mystery_tasks.id", ondelete="CASCADE"), index=True, comment="所属暗访任务"
    )
    restroom_id: Mapped[int] = mapped_column(
        ForeignKey("restrooms.id", ondelete="CASCADE"), index=True, comment="被暗访公厕"
    )
    visit_time: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.now, index=True, comment="暗访时间"
    )
    items: Mapped[list[dict]] = mapped_column(JSON, default=list, comment="检查项打分明细")
    score: Mapped[float] = mapped_column(Float, default=0.0, comment="暗访得分")
    grade: Mapped[str] = mapped_column(String(20), default="", comment="评分等级")
    result: Mapped[str] = mapped_column(String(20), default="正常", index=True, comment="暗访结论")
    images: Mapped[list[str]] = mapped_column(JSON, default=list, comment="现场影像链接")
    problem_note: Mapped[str | None] = mapped_column(Text, nullable=True, comment="问题说明")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    task: Mapped["MysteryTask"] = relationship(back_populates="visits")
    restroom: Mapped["Restroom"] = relationship(back_populates="mystery_visits")  # noqa: F821
    issues: Mapped[list["Issue"]] = relationship(back_populates="mystery_visit")  # noqa: F821
