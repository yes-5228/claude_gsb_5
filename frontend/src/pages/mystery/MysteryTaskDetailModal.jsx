import { Link } from 'react-router-dom';

import { mysteryVisitApi } from '../../api/mystery.js';
import DataTable from '../../components/DataTable.jsx';
import DetailList from '../../components/DetailList.jsx';
import Modal from '../../components/Modal.jsx';
import Pagination from '../../components/Pagination.jsx';
import { GradeTag, ScorePill, StatusTag } from '../../components/Tags.jsx';
import { useListQuery } from '../../hooks/useListQuery.js';
import { formatDateTime } from '../../utils/format.js';

export default function MysteryTaskDetailModal({ task, onClose }) {
  const visits = useListQuery(
    (params) => mysteryVisitApi.list({ ...params, task_id: task.id }),
    {},
    5,
  );

  return (
    <Modal title={`暗访任务 - ${task.title}`} onClose={onClose} width={860}>
      <DetailList
        items={[
          { label: '任务编号', value: task.code },
          { label: '暗访区域', value: task.district },
          { label: '暗访周期', value: task.period },
          { label: '任务状态', value: <StatusTag status={task.status} /> },
          { label: '暗访人', value: task.inspector },
          { label: '第三方机构', value: task.agency || '未填写' },
          {
            label: '暗访均分',
            value: task.avg_score != null ? <ScorePill score={task.avg_score} /> : '暂无记录',
          },
          { label: '发现问题', value: `${task.problem_count} 条记录` },
          { label: '下发时间', value: formatDateTime(task.created_at) },
          { label: '任务说明', value: task.remark || '无' },
        ]}
      />

      <div className="section-title">暗访记录（与内部巡查分开统计）</div>
      <DataTable
        loading={visits.loading}
        error={visits.error}
        rows={visits.items}
        emptyText="该任务暂无暗访记录"
        columns={[
          { key: 'visit_time', title: '暗访时间', render: (row) => formatDateTime(row.visit_time) },
          {
            key: 'restroom',
            title: '公厕',
            render: (row) =>
              row.restroom ? (
                <Link to={`/restrooms/${row.restroom.id}`}>{row.restroom.name}</Link>
              ) : (
                '-'
              ),
          },
          { key: 'score', title: '得分', render: (row) => <ScorePill score={row.score} /> },
          { key: 'grade', title: '等级', render: (row) => <GradeTag grade={row.grade} /> },
          { key: 'result', title: '结论', render: (row) => <StatusTag status={row.result} /> },
          { key: 'issue_count', title: '转问题' },
        ]}
      />
      <Pagination meta={visits.meta} onPageChange={visits.setPage} />
    </Modal>
  );
}
