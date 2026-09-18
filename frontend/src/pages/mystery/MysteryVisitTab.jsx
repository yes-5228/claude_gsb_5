import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { mysteryVisitApi } from '../../api/mystery.js';
import { restroomApi } from '../../api/restrooms.js';
import DataTable from '../../components/DataTable.jsx';
import Field from '../../components/Field.jsx';
import Pagination from '../../components/Pagination.jsx';
import { GradeTag, ScorePill, StatusTag } from '../../components/Tags.jsx';
import { useToast } from '../../components/Toast.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useListQuery } from '../../hooks/useListQuery.js';
import { formatDateTime } from '../../utils/format.js';
import MysteryVisitDetailModal from './MysteryVisitDetailModal.jsx';
import MysteryVisitFormModal from './MysteryVisitFormModal.jsx';

const DEFAULT_FILTERS = { keyword: '', district: '', result: '', date_from: '', date_to: '' };

export default function MysteryVisitTab({ onChanged }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);
  const [active, setActive] = useState(null);

  const list = useListQuery((params) => mysteryVisitApi.list(params), DEFAULT_FILTERS, 10);
  const { data: districts } = useAsync(() => restroomApi.districts(), []);

  const refresh = () => {
    list.reload();
    onChanged?.();
  };

  const remove = async (row) => {
    if (!window.confirm('确认删除该条暗访记录？关联的问题记录不会被删除。')) return;
    try {
      await mysteryVisitApi.remove(row.id);
      toast.success('删除成功');
      refresh();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const reportIssue = (visit) =>
    navigate(`/issues?createFromMystery=${visit.id}&restroomId=${visit.restroom_id}`);

  return (
    <>
      <section className="card">
        <div className="filter-bar">
          <Field label="关键字" full>
            <input
              value={list.filters.keyword}
              placeholder="公厕名称 / 问题说明"
              onChange={(event) => list.updateFilter('keyword', event.target.value)}
            />
          </Field>
          <Field label="所属区域">
            <select
              value={list.filters.district}
              onChange={(event) => list.updateFilter('district', event.target.value)}
            >
              <option value="">全部</option>
              {(districts || []).map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </Field>
          <Field label="暗访结论">
            <select
              value={list.filters.result}
              onChange={(event) => list.updateFilter('result', event.target.value)}
            >
              <option value="">全部</option>
              <option value="正常">正常</option>
              <option value="发现问题">发现问题</option>
            </select>
          </Field>
          <Field label="开始日期">
            <input
              type="date"
              value={list.filters.date_from}
              onChange={(event) => list.updateFilter('date_from', event.target.value)}
            />
          </Field>
          <Field label="结束日期">
            <input
              type="date"
              value={list.filters.date_to}
              onChange={(event) => list.updateFilter('date_to', event.target.value)}
            />
          </Field>
          <button type="button" className="btn" onClick={list.resetFilters}>
            重置
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setShowForm(true)}>
            + 提交暗访记录
          </button>
        </div>
      </section>

      <section className="card">
        <DataTable
          loading={list.loading}
          error={list.error}
          rows={list.items}
          emptyText="暂无暗访记录"
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
            { key: 'district', title: '区域', render: (row) => row.restroom?.district ?? '-' },
            { key: 'task', title: '所属任务', wrap: true, render: (row) => row.task?.title ?? '-' },
            { key: 'inspector', title: '暗访人', render: (row) => row.task?.inspector ?? '-' },
            { key: 'score', title: '得分', render: (row) => <ScorePill score={row.score} /> },
            { key: 'grade', title: '等级', render: (row) => <GradeTag grade={row.grade} /> },
            { key: 'result', title: '结论', render: (row) => <StatusTag status={row.result} /> },
            { key: 'images', title: '影像', render: (row) => `${(row.images || []).length} 张` },
            { key: 'issue_count', title: '转问题' },
            {
              key: 'actions',
              title: '操作',
              render: (row) => (
                <div className="inline">
                  <button type="button" className="btn-link" onClick={() => setActive(row)}>
                    详情
                  </button>
                  <button type="button" className="btn-link" onClick={() => reportIssue(row)}>
                    上报问题
                  </button>
                  <button type="button" className="btn-link danger" onClick={() => remove(row)}>
                    删除
                  </button>
                </div>
              ),
            },
          ]}
        />
        <Pagination meta={list.meta} onPageChange={list.setPage} />
      </section>

      {showForm ? (
        <MysteryVisitFormModal onClose={() => setShowForm(false)} onSaved={refresh} />
      ) : null}

      {active ? (
        <MysteryVisitDetailModal
          visit={active}
          onClose={() => setActive(null)}
          onReportIssue={reportIssue}
        />
      ) : null}
    </>
  );
}
