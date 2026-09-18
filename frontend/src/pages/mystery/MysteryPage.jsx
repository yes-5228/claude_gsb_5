import { useState } from 'react';

import { mysteryStatsApi } from '../../api/mystery.js';
import PageHeader from '../../components/PageHeader.jsx';
import StatCard from '../../components/StatCard.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import MysteryTaskTab from './MysteryTaskTab.jsx';
import MysteryVisitTab from './MysteryVisitTab.jsx';

const TABS = [
  { key: 'tasks', label: '暗访任务' },
  { key: 'visits', label: '暗访记录' },
];

export default function MysteryPage() {
  const [tab, setTab] = useState('tasks');
  const { data: stats, reload: reloadStats } = useAsync(() => mysteryStatsApi.get(), []);

  return (
    <>
      <PageHeader
        title="第三方暗访"
        description="暗访任务按区域与周期下发，暗访人按统一评分表打分，结论与内部巡查分开统计"
      />
      <div className="content">
        {stats ? (
          <div className="stat-grid">
            <StatCard
              label="暗访任务"
              value={stats.task_total}
              unit="项"
              tone="info"
              foot={`进行中 ${stats.task_running} 项`}
            />
            <StatCard
              label="暗访记录"
              value={stats.visit_total}
              unit="条"
              foot={`发现问题 ${stats.problem_visit_total} 条`}
            />
            <StatCard
              label="暗访均分"
              value={stats.avg_score.toFixed(1)}
              unit="分"
              tone={stats.avg_score >= 85 ? 'primary' : 'warning'}
              foot="与内部巡查分开统计"
            />
            <StatCard
              label="暗访转问题"
              value={stats.issue_total}
              unit="条"
              tone={stats.issue_open > 0 ? 'danger' : 'primary'}
              foot={`未闭环 ${stats.issue_open} 条，按普通问题整改`}
            />
          </div>
        ) : null}

        <div className="inline">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`btn btn-sm${tab === item.key ? ' btn-primary' : ''}`}
              onClick={() => setTab(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === 'tasks' ? <MysteryTaskTab onChanged={reloadStats} /> : null}
        {tab === 'visits' ? <MysteryVisitTab onChanged={reloadStats} /> : null}
      </div>
    </>
  );
}
