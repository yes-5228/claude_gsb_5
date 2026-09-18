import { useEffect, useState } from 'react';

import { mysteryApi } from '../../api/mystery.js';
import { restroomApi } from '../../api/restrooms.js';
import Field from '../../components/Field.jsx';
import Modal from '../../components/Modal.jsx';
import { useToast } from '../../components/Toast.jsx';
import { toDateTimeInput } from '../../utils/format.js';

export default function TaskFormModal({ task, onClose, onSaved }) {
  const toast = useToast();
  const [districts, setDistricts] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    name: task?.name || '',
    district: task?.district || '',
    period: task?.period || '',
    inspector: task?.inspector || '',
    start_date: task?.start_date ? toDateTimeInput(task.start_date) : toDateTimeInput(),
    end_date: task?.end_date
      ? toDateTimeInput(task.end_date)
      : toDateTimeInput(new Date(Date.now() + 6 * 24 * 3600 * 1000)),
    remark: task?.remark || '',
  });

  useEffect(() => {
    restroomApi
      .districts()
      .then(setDistricts)
      .catch((err) => setError(err.message));
  }, []);

  const setValue = (key) => (event) =>
    setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setError('请填写任务名称');
      return;
    }
    if (!form.district) {
      setError('请选择暗访区域');
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      ...form,
      period: form.period.trim(),
      start_date: form.start_date ? new Date(form.start_date).toISOString() : null,
      end_date: form.end_date ? new Date(form.end_date).toISOString() : null,
    };
    try {
      if (task) {
        await mysteryApi.updateTask(task.id, payload);
        toast.success('暗访任务已更新');
      } else {
        await mysteryApi.createTask(payload);
        toast.success('暗访任务已下发');
      }
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
      title={task ? '编辑暗访任务' : '下发第三方暗访任务'}
      onClose={onClose}
      width={760}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
          <button type="submit" form="task-form" className="btn btn-primary" disabled={saving}>
            {saving ? '提交中…' : task ? '保存修改' : '下发任务'}
          </button>
        </>
      }
    >
      {error ? <div className="alert alert-error">{error}</div> : null}
      <form id="task-form" className="form-grid" onSubmit={submit}>
        <Field label="任务名称 *" full>
          <input value={form.name} onChange={setValue('name')} placeholder="如：城东区公厕卫生第 38 周暗访" />
        </Field>
        <Field label="暗访区域 *">
          <select value={form.district} onChange={setValue('district')}>
            <option value="">请选择区域</option>
            {districts.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </Field>
        <Field label="暗访周期" hint="留空则按开始时间自动生成，如 2026-W38">
          <input value={form.period} onChange={setValue('period')} placeholder="2026-W38" />
        </Field>
        <Field label="暗访人 / 第三方机构">
          <input value={form.inspector} onChange={setValue('inspector')} placeholder="第三方测评机构名称" />
        </Field>
        <Field label="周期开始">
          <input type="datetime-local" value={form.start_date} onChange={setValue('start_date')} />
        </Field>
        <Field label="周期截止">
          <input type="datetime-local" value={form.end_date} onChange={setValue('end_date')} />
        </Field>
        <Field label="任务说明" full>
          <textarea rows="2" value={form.remark} onChange={setValue('remark')} />
        </Field>
      </form>
    </Modal>
  );
}
