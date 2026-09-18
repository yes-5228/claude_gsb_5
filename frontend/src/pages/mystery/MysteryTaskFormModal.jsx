import { useEffect, useState } from 'react';

import { mysteryTaskApi } from '../../api/mystery.js';
import { restroomApi } from '../../api/restrooms.js';
import Field from '../../components/Field.jsx';
import Modal from '../../components/Modal.jsx';
import { useToast } from '../../components/Toast.jsx';

function defaultPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export default function MysteryTaskFormModal({ onClose, onSaved }) {
  const toast = useToast();
  const [districts, setDistricts] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    title: '',
    district: '',
    period: defaultPeriod(),
    inspector: '',
    agency: '',
    remark: '',
  });

  useEffect(() => {
    restroomApi
      .districts()
      .then(setDistricts)
      .catch((err) => setError(err.message));
  }, []);

  const setValue = (key) => (event) =>
    setForm((prev) => ({ ...prev, [key]: event.target.value }));

  // 标题留空时按「周期 + 区域」自动拟一个，方便快速下发
  const resolvedTitle = () =>
    form.title.trim() || `${form.period} ${form.district}第三方暗访测评`;

  const submit = async (event) => {
    event.preventDefault();
    if (!form.district) {
      setError('请选择暗访区域');
      return;
    }
    if (!form.period.trim()) {
      setError('请填写暗访周期');
      return;
    }
    if (!form.inspector.trim()) {
      setError('请填写暗访人');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await mysteryTaskApi.create({
        ...form,
        title: resolvedTitle(),
        agency: form.agency.trim() || null,
        remark: form.remark.trim() || null,
      });
      toast.success('暗访任务已下发');
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
      title="下发第三方暗访任务"
      onClose={onClose}
      width={720}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
          <button type="submit" form="mystery-task-form" className="btn btn-primary" disabled={saving}>
            {saving ? '下发中…' : '下发任务'}
          </button>
        </>
      }
    >
      {error ? <div className="alert alert-error">{error}</div> : null}
      <form id="mystery-task-form" className="form-grid" onSubmit={submit}>
        <Field label="暗访区域 *">
          <select value={form.district} onChange={setValue('district')}>
            <option value="">请选择区域</option>
            {districts.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </Field>
        <Field label="暗访周期 *" hint="如 2026-09，按周期下发与统计">
          <input
            type="month"
            value={form.period}
            onChange={setValue('period')}
          />
        </Field>
        <Field label="暗访人 *">
          <input
            value={form.inspector}
            onChange={setValue('inspector')}
            placeholder="第三方暗访人员姓名"
          />
        </Field>
        <Field label="第三方机构">
          <input
            value={form.agency}
            onChange={setValue('agency')}
            placeholder="测评机构名称（可选）"
          />
        </Field>
        <Field label="任务标题" full hint={`留空自动生成：${form.period || '周期'} ${form.district || '区域'}第三方暗访测评`}>
          <input
            value={form.title}
            onChange={setValue('title')}
            placeholder="自定义任务标题（可选）"
          />
        </Field>
        <Field label="任务说明" full>
          <textarea
            rows="2"
            value={form.remark}
            onChange={setValue('remark')}
            placeholder="暗访要求、覆盖范围等说明（可选）"
          />
        </Field>
      </form>
    </Modal>
  );
}
