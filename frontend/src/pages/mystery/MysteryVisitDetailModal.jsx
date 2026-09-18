import DetailList from '../../components/DetailList.jsx';
import Modal from '../../components/Modal.jsx';
import { GradeTag, ScorePill, StatusTag } from '../../components/Tags.jsx';
import { formatDateTime } from '../../utils/format.js';

export default function MysteryVisitDetailModal({ visit, onClose, onReportIssue }) {
  if (!visit) return null;
  const images = visit.images || [];

  return (
    <Modal
      title={`暗访详情 - ${visit.restroom?.name ?? ''}`}
      onClose={onClose}
      width={760}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            关闭
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onReportIssue(visit)}
          >
            就此记录上报问题
          </button>
        </>
      }
    >
      <DetailList
        items={[
          { label: '暗访时间', value: formatDateTime(visit.visit_time) },
          { label: '所属任务', value: visit.task?.title ?? '-' },
          { label: '暗访周期', value: visit.task?.period ?? '-' },
          { label: '暗访人', value: visit.task?.inspector ?? '-' },
          { label: '得分', value: <ScorePill score={visit.score} /> },
          { label: '评分等级', value: <GradeTag grade={visit.grade} /> },
          { label: '暗访结论', value: <StatusTag status={visit.result} /> },
          { label: '转入整改', value: `${visit.issue_count} 条问题` },
        ]}
      />

      <div className="section-title">统一评分表明细</div>
      <div className="check-grid">
        {(visit.items || []).map((item) => (
          <div className={`check-item${item.score < 6 ? ' is-low' : ''}`} key={item.name}>
            <div className="name">{item.name}</div>
            <div className="score-line">
              <ScorePill score={item.score} />
              <span className="muted">{item.score >= 6 ? '达标' : '不达标'}</span>
            </div>
            {item.remark ? <div className="muted" style={{ fontSize: 12 }}>{item.remark}</div> : null}
          </div>
        ))}
      </div>

      <div className="section-title" style={{ marginTop: 12 }}>
        现场影像（{images.length} 张）
      </div>
      {images.length ? (
        <div className="image-grid">
          {images.map((url) => (
            <a key={url} href={url} target="_blank" rel="noreferrer">
              <img src={url} alt="暗访现场影像" loading="lazy" />
            </a>
          ))}
        </div>
      ) : (
        <div className="muted">未提交现场影像</div>
      )}

      <div className="section-title">问题说明</div>
      <div className="muted">{visit.problem_note || '无'}</div>
    </Modal>
  );
}
