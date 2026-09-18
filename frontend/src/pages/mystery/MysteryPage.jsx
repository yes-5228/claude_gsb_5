import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { mysteryApi } from '../../api/mystery.js';
import { restroomApi } from '../../api/restrooms.js';
import DataTable from '../../components/DataTable.jsx';
import Field from '../../components/Field.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import Pagination from '../../components/Pagination.jsx';
import { GradeTag, ScorePill, StatusTag } from '../../components/Tags.jsx';
import { useToast } from '../../components/Toast.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useDictionaries } from '../../hooks/useDictionaries.js';
import { useListQuery } from '../../hooks/useListQuery.js';
import { formatDateTime } from '../../utils/format.js';
import TaskDetailModal from './TaskDetailModal.jsx';
import TaskFormModal from './TaskFormModal.jsx';
import VisitDetailModal from './VisitDetailModal.jsx';
import VisitFormModal from './VisitFormModal.jsx';

const TABS = [
  { key: 'tasks', label: '暗访任务' },
  { key: 'visits', label: '暗访记录' },
];

const TASK_FILTERS = { keyword: '', district: '', status: '', period: '' };
const VISIT_FILTERS = { keyword: '', district: '', result: '', date_from: '', date_to: '' };

export default function MysteryPage() {
  const { dictionaries } = useDictionaries();
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get('tab') === 'visits' ? 'visits' : 'tasks');
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [activeTaskId, setActiveTaskId] = useState(null);
  const [showVisitForm, setShowVisitForm] = useState(false);
  const [activeVisit, setActiveVisit] = useState(null);

  const { data: districts } = useAsync(() => restroomApi.districts(), []);
  const { data: periods } = useAsync(() => mysteryApi.periods(), []);

  const tasks = useListQuery((params) => mysteryApi.listTasks(params), TASK_FILTERS, 10);
  const visits = useListQuery((params) => mysteryApi.listVisits(params), VISIT_FILTERS, 10);

  // 支持从公厕详情 / 其他页面带参跳转
  useEffect(() => {
    const taskId = searchParams.get('taskId');
    if (taskId) {
      setTab('tasks');
      setActiveTaskId(Number(taskId));
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const switchTab = (key) => {
    setTab(key);
    setActiveVisit(null);
  };

  const removeTask = async (row) => {
    if (!window.confirm(`确认删除暗访任务「${row.name}」及其全部暗访记录？`)) return;
    try {
      await mysteryApi.removeTask(row.id);
      toast.success('删除成功');
      tasks.reload();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const removeVisit = async (row) => {
    if (!window.confirm('确认删除该条暗访记录？关联的问题工单不会被删除。')) return;
    try {
      await mysteryApi.removeVisit(row.id);
      toast.success('删除成功');
      visits.reload();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <>
      <PageHeader
        title="第三方暗访"
        description="暗访任务按区域与周期下发，暗访人按统一评分表打分并提交现场影像；结论与内部巡查分开统计，发现的问题按普通问题进入整改流程"
        actions={
          tab === 'tasks' ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setEditTask(null);
                setShowTaskForm(true);
              }}
            >
              + 下发暗访任务
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => setShowVisitForm(true)}>
              + 提交暗访记录
            </button>
          )
        }
      />
      <div className="content">
        <div className="inline">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`btn btn-sm${tab === item.key ? ' btn-primary' : ''}`}
              onClick={() => switchTab(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === 'tasks' ? (
          <>
            <section className="card">
              <div className="filter-bar">
                <Field label="关键字" full>
                  <input
                    value={tasks.filters.keyword}
                    placeholder="任务名称 / 编号 / 暗访机构"
                    onChange={(event) => tasks.updateFilter('keyword', event.target.value)}
                  />
                </Field>
                <Field label="暗访区域">
                  <select value={tasks.filters.district} onChange={(event) => tasks.updateFilter('district', event.target.value)}>
                    <option value="">全部</option>
                    {(districts || []).map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </Field>
                <Field label="任务状态">
                  <select value={tasks.filters.status} onChange={(event) => tasks.updateFilter('status', event.target.value)}>
                    <option value="">全部</option>
                    {(dictionaries?.mystery_task_status || []).map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </Field>
                <Field label="暗访周期">
                  <select value={tasks.filters.period} onChange={(event) => tasks.updateFilter('period', event.target.value)}>
                    <option value="">全部</option>
                    {(periods || []).map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </Field>
                <button type="button" className="btn" onClick={tasks.resetFilters}>
                  重置
                </button>
              </div>
            </section>

            <section className="card">
              <DataTable
                loading={tasks.loading}
                error={tasks.error}
                rows={tasks.items}
                emptyText="暂无暗访任务"
                columns={[
                  { key: 'code', title: '任务编号' },
                  {
                    key: 'name',
                    title: '任务名称',
                    wrap: true,
                    render: (row) => (
                      <button type="button" className="btn-link" onClick={() => setActiveTaskId(row.id)}>
                        {row.name}
                      </button>
                    ),
                  },
                  { key: 'district', title: '区域' },
                  { key: 'period', title: '周期' },
                  { key: 'inspector', title: '暗访机构/人' },
                  { key: 'status', title: '状态', render: (row) => <StatusTag status={row.status} /> },
                  { key: 'visit_count', title: '暗访次数' },
                  { key: 'problem_count', title: '发现问题' },
                  {
                    key: 'actions',
                    title: '操作',
                    render: (row) => (
                      <div className="inline">
                        <button type="button" className="btn-link" onClick={() => setActiveTaskId(row.id)}>
                          详情 / 流转
                        </button>
                        <button
                          type="button"
                          className="btn-link"
                          onClick={() => {
                            setEditTask(row);
                            setShowTaskForm(true);
                          }}
                        >
                          编辑
                        </button>
                        <button type="button" className="btn-link danger" onClick={() => removeTask(row)}>
                          删除
                        </button>
                      </div>
                    ),
                  },
                ]}
              />
              <Pagination meta={tasks.meta} onPageChange={tasks.setPage} />
            </section>
          </>
        ) : null}

        {tab === 'visits' ? (
          <>
            <section className="card">
              <div className="filter-bar">
                <Field label="关键字" full>
                  <input
                    value={visits.filters.keyword}
                    placeholder="公厕名称 / 问题说明 / 暗访人"
                    onChange={(event) => visits.updateFilter('keyword', event.target.value)}
                  />
                </Field>
                <Field label="所属区域">
                  <select value={visits.filters.district} onChange={(event) => visits.updateFilter('district', event.target.value)}>
                    <option value="">全部</option>
                    {(districts || []).map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </Field>
                <Field label="暗访结论">
                  <select value={visits.filters.result} onChange={(event) => visits.updateFilter('result', event.target.value)}>
                    <option value="">全部</option>
                    <option value="正常">正常</option>
                    <option value="发现问题">发现问题</option>
                  </select>
                </Field>
                <Field label="开始日期">
                  <input type="date" value={visits.filters.date_from} onChange={(event) => visits.updateFilter('date_from', event.target.value)} />
                </Field>
                <Field label="结束日期">
                  <input type="date" value={visits.filters.date_to} onChange={(event) => visits.updateFilter('date_to', event.target.value)} />
                </Field>
                <button type="button" className="btn" onClick={visits.resetFilters}>
                  重置
                </button>
              </div>
            </section>

            <section className="card">
              <DataTable
                loading={visits.loading}
                error={visits.error}
                rows={visits.items}
                emptyText="暂无暗访记录"
                columns={[
                  {
                    key: 'visit_time',
                    title: '暗访时间',
                    render: (row) => formatDateTime(row.visit_time),
                  },
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
                  { key: 'inspector', title: '暗访人' },
                  { key: 'score', title: '得分', render: (row) => <ScorePill score={row.score} /> },
                  { key: 'grade', title: '等级', render: (row) => <GradeTag grade={row.grade} /> },
                  { key: 'result', title: '结论', render: (row) => <StatusTag status={row.result} /> },
                  { key: 'issue_count', title: '关联问题' },
                  {
                    key: 'actions',
                    title: '操作',
                    render: (row) => (
                      <div className="inline">
                        <button type="button" className="btn-link" onClick={() => setActiveVisit(row)}>
                          详情
                        </button>
                        <button type="button" className="btn-link danger" onClick={() => removeVisit(row)}>
                          删除
                        </button>
                      </div>
                    ),
                  },
                ]}
              />
              <Pagination meta={visits.meta} onPageChange={visits.setPage} />
            </section>
          </>
        ) : null}
      </div>

      {showTaskForm ? (
        <TaskFormModal
          task={editTask}
          onClose={() => setShowTaskForm(false)}
          onSaved={() => {
            tasks.reload();
            if (activeTaskId) visits.reload();
          }}
        />
      ) : null}

      {showVisitForm ? (
        <VisitFormModal onClose={() => setShowVisitForm(false)} onSaved={visits.reload} />
      ) : null}

      {activeTaskId ? (
        <TaskDetailModal
          taskId={activeTaskId}
          onClose={() => setActiveTaskId(null)}
          onChanged={() => {
            tasks.reload();
            visits.reload();
          }}
        />
      ) : null}

      {activeVisit ? (
        <VisitDetailModal
          visit={activeVisit}
          onClose={() => setActiveVisit(null)}
          onReportIssue={(item) => {
            setActiveVisit(null);
            navigate(`/issues?createFromMystery=${item.id}&restroomId=${item.restroom_id}`);
          }}
        />
      ) : null}
    </>
  );
}
