import { useState } from 'react';

import { mysteryTaskApi } from '../../api/mystery.js';
import { restroomApi } from '../../api/restrooms.js';
import DataTable from '../../components/DataTable.jsx';
import Field from '../../components/Field.jsx';
import Pagination from '../../components/Pagination.jsx';
import { ScorePill, StatusTag } from '../../components/Tags.jsx';
import { useToast } from '../../components/Toast.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useDictionaries } from '../../hooks/useDictionaries.js';
import { useListQuery } from '../../hooks/useListQuery.js';
import MysteryTaskDetailModal from './MysteryTaskDetailModal.jsx';
import MysteryTaskFormModal from './MysteryTaskFormModal.jsx';
import MysteryVisitFormModal from './MysteryVisitFormModal.jsx';

const DEFAULT_FILTERS = { keyword: '', district: '', status: '', period: '' };

export default function MysteryTaskTab({ onChanged }) {
  const { dictionaries } = useDictionaries();
  const toast = useToast();
  const [showForm, setShowForm] = useState(false);
  const [active, setActive] = useState(null);
  const [visitTask, setVisitTask] = useState(null);

  const list = useListQuery((params) => mysteryTaskApi.list(params), DEFAULT_FILTERS, 10);
  const { data: districts } = useAsync(() => restroomApi.districts(), []);

  const refresh = () => {
    list.reload();
    onChanged?.();
  };

  const changeStatus = async (row, status, label) => {
    try {
      await mysteryTaskApi.update(row.id, { status });
      toast.success(`任务已${label}`);
      refresh();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const remove = async (row) => {
    if (!window.confirm(`确认删除暗访任务「${row.title}」？`)) return;
    try {
      await mysteryTaskApi.remove(row.id);
      toast.success('删除成功');
      refresh();
    } catch (err) {
      if (err.status === 409 && window.confirm(`${err.message}\n是否强制删除该任务及其全部暗访记录？`)) {
        try {
          await mysteryTaskApi.remove(row.id, { force: true });
          toast.success('已强制删除');
          refresh();
        } catch (forceErr) {
          toast.error(forceErr.message);
        }
      } else if (err.status !== 409) {
        toast.error(err.message);
      }
    }
  };

  return (
    <>
      <section className="card">
        <div className="filter-bar">
          <Field label="关键字" full>
            <input
              value={list.filters.keyword}
              placeholder="任务标题 / 编号 / 暗访人"
              onChange={(event) => list.updateFilter('keyword', event.target.value)}
            />
          </Field>
          <Field label="暗访区域">
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
          <Field label="任务状态">
            <select
              value={list.filters.status}
              onChange={(event) => list.updateFilter('status', event.target.value)}
            >
              <option value="">全部</option>
              {(dictionaries?.mystery_task_status || []).map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </Field>
          <Field label="暗访周期">
            <input
              value={list.filters.period}
              placeholder="如 2026-09"
              onChange={(event) => list.updateFilter('period', event.target.value)}
            />
          </Field>
          <button type="button" className="btn" onClick={list.resetFilters}>
            重置
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setShowForm(true)}>
            + 下发暗访任务
          </button>
        </div>
      </section>

      <section className="card">
        <DataTable
          loading={list.loading}
          error={list.error}
          rows={list.items}
          emptyText="暂无暗访任务，点击右上角「下发暗访任务」开始"
          columns={[
            { key: 'code', title: '任务编号' },
            { key: 'title', title: '任务标题', wrap: true },
            { key: 'district', title: '区域' },
            { key: 'period', title: '周期' },
            { key: 'inspector', title: '暗访人' },
            { key: 'status', title: '状态', render: (row) => <StatusTag status={row.status} /> },
            { key: 'visit_count', title: '暗访记录' },
            {
              key: 'avg_score',
              title: '均分',
              render: (row) => (row.avg_score != null ? <ScorePill score={row.avg_score} /> : '-'),
            },
            { key: 'problem_count', title: '发现问题' },
            {
              key: 'actions',
              title: '操作',
              render: (row) => (
                <div className="inline">
                  <button type="button" className="btn-link" onClick={() => setActive(row)}>
                    详情
                  </button>
                  {['待执行', '进行中'].includes(row.status) ? (
                    <button type="button" className="btn-link" onClick={() => setVisitTask(row)}>
                      提交记录
                    </button>
                  ) : null}
                  {row.status === '待执行' ? (
                    <button
                      type="button"
                      className="btn-link"
                      onClick={() => changeStatus(row, '进行中', '启动')}
                    >
                      开始
                    </button>
                  ) : null}
                  {row.status === '进行中' ? (
                    <button
                      type="button"
                      className="btn-link"
                      onClick={() => changeStatus(row, '已完成', '完成')}
                    >
                      完成
                    </button>
                  ) : null}
                  {['待执行', '进行中'].includes(row.status) ? (
                    <button
                      type="button"
                      className="btn-link"
                      onClick={() => changeStatus(row, '已取消', '取消')}
                    >
                      取消
                    </button>
                  ) : null}
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
        <MysteryTaskFormModal onClose={() => setShowForm(false)} onSaved={refresh} />
      ) : null}

      {active ? (
        <MysteryTaskDetailModal task={active} onClose={() => setActive(null)} />
      ) : null}

      {visitTask ? (
        <MysteryVisitFormModal
          defaultTaskId={visitTask.id}
          onClose={() => setVisitTask(null)}
          onSaved={refresh}
        />
      ) : null}
    </>
  );
}
