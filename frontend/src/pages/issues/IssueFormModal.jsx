import { useEffect, useState } from 'react';

import { inspectionApi } from '../../api/inspections.js';
import { issueApi } from '../../api/issues.js';
import { metaApi } from '../../api/meta.js';
import { mysteryApi } from '../../api/mystery.js';
import Field from '../../components/Field.jsx';
import Modal from '../../components/Modal.jsx';
import { SourceTag } from '../../components/Tags.jsx';
import { useToast } from '../../components/Toast.jsx';
import { useDictionaries } from '../../hooks/useDictionaries.js';
import { toDateTimeInput } from '../../utils/format.js';

export default function IssueFormModal({
  defaultRestroomId,
  defaultInspectionId,
  defaultMysteryVisitId,
  onClose,
  onSaved,
}) {
  const { dictionaries } = useDictionaries();
  const toast = useToast();
  const [restrooms, setRestrooms] = useState([]);
  const [inspections, setInspections] = useState([]);
  const [visits, setVisits] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    restroom_id: defaultRestroomId ? Number(defaultRestroomId) : '',
    inspection_id: defaultInspectionId ? Number(defaultInspectionId) : '',
    mystery_visit_id: defaultMysteryVisitId ? Number(defaultMysteryVisitId) : '',
    title: '',
    description: '',
    category: '保洁不到位',
    severity: '一般',
    reporter: '',
    assignee: '',
    deadline: toDateTimeInput(new Date(Date.now() + 3 * 24 * 3600 * 1000)),
    initial_remark: '',
  });

  useEffect(() => {
    metaApi
      .restroomOptions()
      .then(setRestrooms)
      .catch((err) => setError(err.message));
  }, []);

  // 切换公厕后加载该公厕的巡查记录与暗访记录，供关联选择（二者互斥）
  useEffect(() => {
    if (!form.restroom_id) {
      setInspections([]);
      setVisits([]);
      return undefined;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const [inspData, visitData] = await Promise.all([
          inspectionApi.list({ restroom_id: form.restroom_id, page_size: 30 }),
          mysteryApi.listVisits({ restroom_id: form.restroom_id, page_size: 30 }),
        ]);
        let inspRows = inspData.items;
        let visitRows = visitData.items;
        const presetInsp = defaultInspectionId ? Number(defaultInspectionId) : null;
        const presetVisit = defaultMysteryVisitId ? Number(defaultMysteryVisitId) : null;
        if (presetInsp && !inspRows.some((item) => item.id === presetInsp)) {
          const extra = await inspectionApi.detail(presetInsp).catch(() => null);
          if (extra) inspRows = [extra, ...inspRows];
        }
        if (presetVisit && !visitRows.some((item) => item.id === presetVisit)) {
          const extra = await mysteryApi.visitDetail(presetVisit).catch(() => null);
          if (extra) visitRows = [extra, ...visitRows];
        }
        if (!cancelled) {
          setInspections(inspRows);
          setVisits(visitRows);
          // 从暗访记录跳转过来时，带入暗访人与问题说明
          if (presetVisit) {
            const visit = visitRows.find((item) => item.id === presetVisit);
            if (visit) {
              setForm((prev) => ({
                ...prev,
                reporter: prev.reporter || visit.inspector,
                description: prev.description || visit.problem_desc || '',
              }));
            }
          }
        }
      } catch {
        if (!cancelled) {
          setInspections([]);
          setVisits([]);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.restroom_id]);

  const setValue = (key) => (event) =>
    setForm((prev) => ({ ...prev, [key]: event.target.value }));

  // 内部巡查与第三方暗访关联互斥
  const selectInspection = (value) =>
    setForm((prev) => ({
      ...prev,
      inspection_id: value,
      mystery_visit_id: value ? '' : prev.mystery_visit_id,
    }));
  const selectMystery = (value) =>
    setForm((prev) => ({
      ...prev,
      mystery_visit_id: value,
      inspection_id: value ? '' : prev.inspection_id,
    }));

  const submit = async (event) => {
    event.preventDefault();
    if (!form.restroom_id) {
      setError('请选择所属公厕');
      return;
    }
    if (!form.title.trim()) {
      setError('请填写问题标题');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await issueApi.create({
        ...form,
        restroom_id: Number(form.restroom_id),
        inspection_id: form.inspection_id ? Number(form.inspection_id) : null,
        mystery_visit_id: form.mystery_visit_id ? Number(form.mystery_visit_id) : null,
        deadline: form.deadline ? new Date(form.deadline).toISOString() : null,
      });
      toast.success('问题已上报，进入待整改状态');
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="问题上报"
      onClose={onClose}
      width={780}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
          <button type="submit" form="issue-form" className="btn btn-primary" disabled={saving}>
            {saving ? '提交中...' : '提交上报'}
          </button>
        </>
      }
    >
      {error ? <div className="alert alert-error">{error}</div> : null}
      <form id="issue-form" className="form-grid" onSubmit={submit}>
        <Field label="所属公厕 *">
          <select value={form.restroom_id} onChange={setValue('restroom_id')}>
            <option value="">请选择公厕</option>
            {restrooms.map((item) => (
              <option key={item.id} value={item.id}>
                {item.code} {item.name}（{item.district}）
              </option>
            ))}
          </select>
        </Field>
        <Field label="问题来源" hint="关联暗访记录后自动标记为第三方暗访">
          <div style={{ alignSelf: 'center' }}>
            {form.mystery_visit_id ? <SourceTag source="第三方暗访" /> : <SourceTag source="内部巡查" />}
          </div>
        </Field>
        <Field label="关联巡查记录" hint="可不选，直接上报">
          <select value={form.inspection_id} onChange={(event) => selectInspection(event.target.value)}>
            <option value="">不关联</option>
            {inspections.map((item) => (
              <option key={item.id} value={item.id}>
                {new Date(item.inspect_time).toLocaleString('zh-CN')} · {item.inspector} · {item.score} 分
              </option>
            ))}
          </select>
        </Field>
        <Field label="关联暗访记录" hint="与巡查记录互斥">
          <select value={form.mystery_visit_id} onChange={(event) => selectMystery(event.target.value)}>
            <option value="">不关联</option>
            {visits.map((item) => (
              <option key={item.id} value={item.id}>
                {new Date(item.visit_time).toLocaleString('zh-CN')} · {item.inspector} · {item.score} 分
              </option>
            ))}
          </select>
        </Field>
        <Field label="问题标题 *" full>
          <input value={form.title} onChange={setValue('title')} placeholder="如：地面污渍未及时清理" />
        </Field>
        <Field label="问题分类">
          <select value={form.category} onChange={setValue('category')}>
            {(dictionaries?.issue_category || []).map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </Field>
        <Field label="严重程度">
          <select value={form.severity} onChange={setValue('severity')}>
            {(dictionaries?.issue_severity || []).map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </Field>
        <Field label="上报人">
          <input value={form.reporter} onChange={setValue('reporter')} placeholder="巡查员 / 暗访人 / 群众" />
        </Field>
        <Field label="整改责任人">
          <input value={form.assignee} onChange={setValue('assignee')} placeholder="保洁班组 / 责任人" />
        </Field>
        <Field label="整改期限">
          <input type="datetime-local" value={form.deadline} onChange={setValue('deadline')} />
        </Field>
        <Field label="问题描述" full>
          <textarea rows="3" value={form.description} onChange={setValue('description')} />
        </Field>
        <Field label="上报说明" full>
          <textarea
            rows="2"
            value={form.initial_remark}
            onChange={setValue('initial_remark')}
            placeholder="将记录在整改轨迹的首条节点"
          />
        </Field>
      </form>
    </Modal>
  );
}
