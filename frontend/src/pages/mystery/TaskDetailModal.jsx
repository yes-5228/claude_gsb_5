import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { mysteryApi } from '../../api/mystery.js';
import DataTable from '../../components/DataTable.jsx';
import DetailList from '../../components/DetailList.jsx';
import Modal from '../../components/Modal.jsx';
import { GradeTag, ScorePill, StatusTag } from '../../components/Tags.jsx';
import { useToast } from '../../components/Toast.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { formatDateTime } from '../../utils/format.js';
import TaskActionModal from './TaskActionModal.jsx';
import VisitDetailModal from './VisitDetailModal.jsx';

export default function TaskDetailModal({ taskId, onClose, onChanged }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [action, setAction] = useState(null);
  const [visit, setVisit] = useState(null);
  const [saving, setSaving] = useState(false);

  const { data: task, loading, error, reload } = useAsync(
    () => mysteryApi.taskDetail(taskId),
    [taskId],
  );
  const { data: options } = useAsync(() => mysteryApi.taskTransitions(taskId), [taskId]);

  const submitTransition = async (payload) => {
    setSaving(true);
    try {
      await mysteryApi.changeTaskStatus(taskId, payload);
      toast.success('任务状态已更新');
      setAction(null);
      reload();
      onChanged?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={task ? `暗访任务 ${task.code}` : '暗访任务详情'}
      onClose={onClose}
      width={900}
      footer={<button type="button" className="btn" onClick={onClose}>关闭</button>}
    >
      {error ? <div className="alert alert-error">{error.message}</div> : null}
      {loading && !task ? <div className="loading-block">加载中…</div> : null}

      {task ? (
        <>
          <div className="card-title">
            <div className="inline">
              <h3>{task.name}</h3>
              <StatusTag status={task.status} />
            </div>
            <span className="hint">
              暗访 {task.visit_count} 次 · 发现问题 {task.problem_count} 次
            </span>
          </div>
          <DetailList
            items={[
              { label: '暗访区域', value: task.district },
              { label: '暗访周期', value: task.period },
              { label: '暗访人 / 机构', value: task.inspector || '-' },
              { label: '周期开始', value: formatDateTime(task.start_date) },
              { label: '周期截止', value: formatDateTime(task.end_date) },
              { label: '任务说明', value: task.remark || '无' },
              { label: '下发时间', value: formatDateTime(task.created_at) },
            ]}
          />

          {options?.length ? (
            <div className="action-group" style={{ marginTop: 14 }}>
              {options.map((option) => (
                <button
                  key={option.status}
                  type="button"
                  className={`btn${option.status === '已完成' ? ' btn-primary' : ''}`}
                  onClick={() => setAction(option)}
                >
                  {option.action}（变更为「{option.status}」）
                </button>
              ))}
            </div>
          ) : (
            <div className="alert alert-info" style={{ marginTop: 14 }}>
              该任务已结束，不再接受状态变更。
            </div>
          )}

          <div className="section-title">任务下的暗访记录</div>
          <DataTable
            rows={task.visits || []}
            emptyText="该任务暂无暗访记录"
            columns={[
              {
                key: 'visit_time',
                title: '暗访时间',
                render: (row) => formatDateTime(row.visit_time),
              },
              { key: 'restroom', title: '公厕', render: (row) => row.restroom?.name ?? '-' },
              { key: 'inspector', title: '暗访人' },
              { key: 'score', title: '得分', render: (row) => <ScorePill score={row.score} /> },
              { key: 'grade', title: '等级', render: (row) => <GradeTag grade={row.grade} /> },
              { key: 'result', title: '结论', render: (row) => <StatusTag status={row.result} /> },
              {
                key: 'actions',
                title: '操作',
                render: (row) => (
                  <div className="inline">
                    <button type="button" className="btn-link" onClick={() => setVisit(row)}>
                      详情
                    </button>
                    {row.result === '发现问题' ? (
                      <button
                        type="button"
                        className="btn-link"
                        onClick={() =>
                          navigate(
                            `/issues?createFromMystery=${row.id}&restroomId=${row.restroom_id}`,
                          )
                        }
                      >
                        上报问题
                      </button>
                    ) : null}
                  </div>
                ),
              },
            ]}
          />
        </>
      ) : null}

      {action && task ? (
        <TaskActionModal
          option={action}
          task={task}
          saving={saving}
          onClose={() => setAction(null)}
          onSubmit={submitTransition}
        />
      ) : null}

      {visit ? (
        <VisitDetailModal
          visit={visit}
          onClose={() => setVisit(null)}
          onReportIssue={(item) =>
            navigate(`/issues?createFromMystery=${item.id}&restroomId=${item.restroom_id}`)
          }
        />
      ) : null}
    </Modal>
  );
}
