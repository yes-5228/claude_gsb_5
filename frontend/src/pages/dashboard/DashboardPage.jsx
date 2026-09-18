import { useState } from 'react';

import { statsApi } from '../../api/stats.js';
import BarList from '../../components/BarList.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import StatCard from '../../components/StatCard.jsx';
import TrendChart from '../../components/TrendChart.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import {
  CategoryPanel,
  DistrictPanel,
  IssueSourcePanel,
  IssueStatusPanel,
  RankingPanel,
  RecentInspectionsPanel,
  RecentIssuesPanel,
  RecentMysteryVisitsPanel,
} from './DashboardPanels.jsx';

const RANGE_OPTIONS = [7, 14, 30];

export default function DashboardPage() {
  const [trendDays, setTrendDays] = useState(14);
  const { data, loading, error } = useAsync(
    () => statsApi.dashboard(trendDays),
    [trendDays],
  );

  const overview = data?.overview;

  return (
    <>
      <PageHeader
        title="总览看板"
        description="公厕保洁巡查与问题整改的整体运行情况"
        actions={
          <div className="field" style={{ minWidth: 130 }}>
            <label>统计区间</label>
            <select value={trendDays} onChange={(event) => setTrendDays(Number(event.target.value))}>
              {RANGE_OPTIONS.map((days) => (
                <option key={days} value={days}>
                  近 {days} 天
                </option>
              ))}
            </select>
          </div>
        }
      />
      <div className="content">
        {error ? <div className="alert alert-error">{error.message}</div> : null}
        {loading && !data ? <div className="loading-block">看板数据加载中…</div> : null}

        {overview ? (
          <>
            <div className="stat-grid">
              <StatCard
                label="在册公厕"
                value={overview.restroom_total}
                unit="座"
                foot={`正常开放 ${overview.restroom_open} 座 · 维修 ${overview.restroom_maintenance} 座`}
              />
              <StatCard
                label="巡查记录总数"
                value={overview.inspection_total}
                unit="条"
                tone="info"
                foot={`今日 ${overview.inspection_today} 条 · 近 7 日 ${overview.inspection_week} 条`}
              />
              <StatCard
                label="近 7 日巡查均分"
                value={overview.avg_score_week.toFixed(1)}
                unit="分"
                tone={overview.avg_score_week >= 85 ? 'primary' : 'warning'}
                foot="内部巡查，按百分制折算"
              />
              <StatCard
                label="暗访任务 / 记录"
                value={`${overview.mystery_task_total}/${overview.mystery_visit_total}`}
                unit="个/条"
                tone="info"
                foot={`近 7 日暗访 ${overview.mystery_visit_week} 条`}
              />
              <StatCard
                label="近 7 日暗访均分"
                value={overview.avg_mystery_score_week.toFixed(1)}
                unit="分"
                tone={overview.avg_mystery_score_week >= 85 ? 'primary' : 'warning'}
                foot="第三方暗访，与巡查分开统计"
              />
              <StatCard
                label="未闭环问题"
                value={overview.issue_open}
                unit="条"
                tone={overview.issue_open > 0 ? 'danger' : 'primary'}
                foot={`其中暗访发现 ${overview.mystery_issue_open} 条 · 累计 ${overview.issue_total} 条`}
              />
              <StatCard
                label="超期未整改"
                value={overview.issue_overdue}
                unit="条"
                tone={overview.issue_overdue > 0 ? 'danger' : 'primary'}
                foot="超过整改期限仍未闭环"
              />
              <StatCard
                label="整改闭环率"
                value={overview.rectification_rate.toFixed(1)}
                unit="%"
                tone="info"
                foot={`本月完成 ${overview.issue_done_this_month} 条`}
              />
            </div>

            <div className="grid-2">
              <section className="card">
                <div className="card-title">
                  <h3>巡查与问题趋势</h3>
                  <span className="hint">近 {trendDays} 天</span>
                </div>
                <TrendChart points={data.inspection_trend} />
              </section>
              <IssueStatusPanel items={data.issue_by_status} />
            </div>

            <div className="grid-2">
              <IssueSourcePanel items={data.issue_by_source} />
              <section className="card">
                <div className="card-title">
                  <h3>暗访与巡查口径说明</h3>
                </div>
                <div className="muted" style={{ padding: 12, lineHeight: 1.9 }}>
                  内部巡查与第三方暗访使用统一评分表，但得分与结论<strong>分开统计</strong>：
                  巡查均分仅含内部巡查，暗访均分仅含第三方暗访。暗访发现的问题按普通问题进入
                  同一整改流程，在问题列表中以「第三方暗访」来源标识。
                </div>
              </section>
            </div>

            <div className="grid-2">
              <CategoryPanel items={data.issue_by_category} />
              <section className="card">
                <div className="card-title">
                  <h3>问题严重程度分布</h3>
                </div>
                <BarList
                  items={data.issue_by_severity.map((item) => ({
                    name: item.name,
                    value: item.value,
                    color: item.name === '紧急' ? '#dc2626' : item.name === '严重' ? '#d97706' : '#64748b',
                  }))}
                />
              </section>
            </div>

            <div className="grid-2">
              <DistrictPanel items={data.districts} />
              <RankingPanel items={data.top_restrooms} />
            </div>

            <div className="grid-2">
              <RecentIssuesPanel items={data.recent_issues} />
              <RecentMysteryVisitsPanel items={data.recent_mystery_visits} />
            </div>

            <div className="grid-2">
              <RecentInspectionsPanel items={data.recent_inspections} />
              <section className="card">
                <div className="card-title">
                  <h3>趋势图例</h3>
                  <span className="hint">近 {trendDays} 天巡查 / 暗访 / 问题</span>
                </div>
                <div className="muted" style={{ padding: 12, lineHeight: 1.9 }}>
                  上方趋势图中，深色柱为每日内部巡查次数、橙色柱为每日新增问题；
                  近 7 日暗访共 <strong>{overview.mystery_visit_week}</strong> 条，
                  暗访未闭环问题 <strong>{overview.mystery_issue_open}</strong> 条。
                </div>
              </section>
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}
