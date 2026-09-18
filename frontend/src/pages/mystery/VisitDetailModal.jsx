import { Link } from 'react-router-dom';

import DetailList from '../../components/DetailList.jsx';
import Modal from '../../components/Modal.jsx';
import { GradeTag, ScorePill, StatusTag } from '../../components/Tags.jsx';
import { formatDateTime } from '../../utils/format.js';

export default function VisitDetailModal({ visit, onClose, onReportIssue }) {
  if (!visit) return null;

  return (
    <Modal
      title={`暗访详情 - ${visit.restroom?.name ?? ''}`}
      onClose={onClose}
      width={800}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            关闭
          </button>
          {visit.result === '发现问题' ? (
            <button type="button" className="btn btn-primary" onClick={() => onReportIssue(visit)}>
              就此暗访上报问题
            </button>
          ) : null}
        </>
      }
    >
      <DetailList
        items={[
          { label: '暗访时间', value: formatDateTime(visit.visit_time) },
          { label: '暗访人', value: visit.inspector },
          {
            label: '所属任务',
            value: visit.task_id ? (
              <Link to={`/mystery?tab=tasks&taskId=${visit.task_id}`}>任务 #{visit.task_id}</Link>
            ) : (
              '-'
            ),
          },
          { label: '得分', value: <ScorePill score={visit.score} /> },
          { label: '评分等级', value: <GradeTag grade={visit.grade} /> },
          { label: '暗访结论', value: <StatusTag status={visit.result} /> },
          { label: '关联问题', value: `${visit.issue_count} 条` },
          { label: '问题说明', value: visit.problem_desc || '无' },
          { label: '暗访备注', value: visit.remark || '无' },
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

      <div className="section-title">现场影像</div>
      {visit.images?.length ? (
        <div className="detail-list">
          {visit.images.map((url) => (
            <div className="detail-item" key={url}>
              <div className="label">影像</div>
              <div className="value">
                <a href={url} target="_blank" rel="noreferrer">
                  {url}
                </a>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-block">无现场影像</div>
      )}
    </Modal>
  );
}
