import { useEffect, useMemo, useState } from 'react';

import { mysteryApi } from '../../api/mystery.js';
import { metaApi } from '../../api/meta.js';
import Field from '../../components/Field.jsx';
import Modal from '../../components/Modal.jsx';
import { GradeTag, StatusTag } from '../../components/Tags.jsx';
import { useToast } from '../../components/Toast.jsx';
import { useDictionaries } from '../../hooks/useDictionaries.js';
import { calcScore, gradeOf, resultOf } from '../../utils/scoring.js';
import { toDateTimeInput } from '../../utils/format.js';

export default function VisitFormModal({ defaultTaskId, onClose, onSaved }) {
  const { dictionaries } = useDictionaries();
  const toast = useToast();
  const [tasks, setTasks] = useState([]);
  const [options, setOptions] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    task_id: defaultTaskId ? Number(defaultTaskId) : '',
    restroom_id: '',
    inspector: '',
    visit_time: toDateTimeInput(),
    problem_desc: '',
    remark: '',
  });
  const [items, setItems] = useState([]);
  const [images, setImages] = useState([]);
  const [imageInput, setImageInput] = useState('');

  useEffect(() => {
    // 仅可向待执行 / 进行中 的任务提交暗访
    mysteryApi
      .listTasks({ status: '进行中', page_size: 100 })
      .then((data) => data.items)
      .then((ongoing) =>
        mysteryApi.listTasks({ status: '待执行', page_size: 100 }).then((data) => [
          ...ongoing,
          ...data.items,
        ]),
      )
      .then((rows) => {
        const seen = new Set();
        setTasks(rows.filter((row) => !seen.has(row.id) && seen.add(row.id)));
      })
      .catch((err) => setError(err.message));
    metaApi.restroomOptions().then(setOptions).catch(() => undefined);
  }, []);

  useEffect(() => {
    const template = dictionaries?.inspection_check_items || [];
    setItems(template.map((name) => ({ name, score: 9, remark: '' })));
  }, [dictionaries]);

  const selectedTask = tasks.find((task) => task.id === Number(form.task_id));
  const restroomChoices = selectedTask
    ? options.filter((option) => option.district === selectedTask.district)
    : options;

  const score = useMemo(() => calcScore(items), [items]);
  const grade = gradeOf(score);
  const result = resultOf(items, score);
  const isProblem = result === '发现问题';

  const setItemScore = (index, value) =>
    setItems((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, score: Number(value) } : item)),
    );

  const setItemRemark = (index, value) =>
    setItems((prev) => prev.map((item, idx) => (idx === index ? { ...item, remark: value } : item)));

  const fillAll = (value) => setItems((prev) => prev.map((item) => ({ ...item, score: value })));

  const addImage = () => {
    const url = imageInput.trim();
    if (url && !images.includes(url)) setImages((prev) => [...prev, url]);
    setImageInput('');
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!form.task_id) return setError('请选择所属暗访任务');
    if (!form.restroom_id) return setError('请选择被暗访公厕（须在任务区域内）');
    if (!form.inspector.trim()) return setError('请填写暗访人');
    if (isProblem && !form.problem_desc.trim()) return setError('结论为「发现问题」时，必须填写问题说明');
    if (isProblem && images.length === 0) return setError('结论为「发现问题」时，必须提交现场影像');
    setSaving(true);
    setError(null);
    try {
      await mysteryApi.createVisit({
        ...form,
        task_id: Number(form.task_id),
        restroom_id: Number(form.restroom_id),
        visit_time: form.visit_time ? new Date(form.visit_time).toISOString() : null,
        items,
        images,
      });
      toast.success('暗访记录已提交');
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
      title="提交第三方暗访记录"
      onClose={onClose}
      width={900}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
          <button type="submit" form="visit-form" className="btn btn-primary" disabled={saving}>
            {saving ? '提交中…' : '提交暗访'}
          </button>
        </>
      }
    >
      {error ? <div className="alert alert-error">{error}</div> : null}
      <form id="visit-form" onSubmit={submit} className="form-grid">
        <Field label="所属暗访任务 *">
          <select
            value={form.task_id}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, task_id: event.target.value, restroom_id: '' }))
            }
          >
            <option value="">请选择任务</option>
            {tasks.map((task) => (
              <option key={task.id} value={task.id}>
                {task.code} {task.name}（{task.district} · {task.period}）
              </option>
            ))}
          </select>
        </Field>
        <Field label="被暗访公厕 *" hint={selectedTask ? `仅限区域：${selectedTask.district}` : '先选择任务'}>
          <select value={form.restroom_id} onChange={(event) => setForm((prev) => ({ ...prev, restroom_id: event.target.value }))}>
            <option value="">请选择公厕</option>
            {restroomChoices.map((option) => (
              <option key={option.id} value={option.id}>
                {option.code} {option.name}（{option.district}）
              </option>
            ))}
          </select>
        </Field>
        <Field label="暗访人 *">
          <input value={form.inspector} onChange={(event) => setForm((prev) => ({ ...prev, inspector: event.target.value }))} placeholder="第三方暗访人姓名" />
        </Field>
        <Field label="暗访时间">
          <input type="datetime-local" value={form.visit_time} onChange={(event) => setForm((prev) => ({ ...prev, visit_time: event.target.value }))} />
        </Field>
      </form>

      <div className="card-title">
        <div className="inline">
          <h3>统一评分表（与内部巡查一致，每项 0-10 分）</h3>
          <span className="tag tag-primary">当前得分 {score.toFixed(1)}</span>
          <GradeTag grade={grade} />
          <StatusTag status={result} />
        </div>
        <div className="inline">
          <button type="button" className="btn btn-sm" onClick={() => fillAll(10)}>全部满分</button>
          <button type="button" className="btn btn-sm" onClick={() => fillAll(8)}>全部良好</button>
        </div>
      </div>

      <div className="check-grid">
        {items.map((item, index) => (
          <div className={`check-item${item.score < 6 ? ' is-low' : ''}`} key={item.name}>
            <div className="name">{item.name}</div>
            <div className="score-line">
              <input type="range" min="0" max="10" step="1" value={item.score} onChange={(event) => setItemScore(index, event.target.value)} />
              <strong>{item.score}</strong>
            </div>
            <input
              style={{ marginTop: 6, fontSize: 12.5, padding: '4px 8px' }}
              className="field-input"
              placeholder="备注（可选）"
              value={item.remark || ''}
              onChange={(event) => setItemRemark(index, event.target.value)}
            />
          </div>
        ))}
      </div>

      <Field label="现场影像链接" hint="发现问题时至少上传一张，填写后点「添加」">
        <div className="inline">
          <input
            style={{ flex: 1 }}
            value={imageInput}
            placeholder="https://…/evidence.jpg"
            onChange={(event) => setImageInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addImage();
              }
            }}
          />
          <button type="button" className="btn btn-sm" onClick={addImage}>添加</button>
        </div>
      </Field>
      {images.length ? (
        <ul className="muted" style={{ fontSize: 12.5, paddingLeft: 18, margin: '4px 0' }}>
          {images.map((url) => (
            <li key={url}>
              {url}{' '}
              <button type="button" className="btn-link danger" onClick={() => setImages((prev) => prev.filter((item) => item !== url))}>
                移除
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <Field label="问题说明" full hint={isProblem ? '结论为发现问题，必填' : '未发现问题时可留空'}>
        <textarea
          rows="2"
          value={form.problem_desc}
          onChange={(event) => setForm((prev) => ({ ...prev, problem_desc: event.target.value }))}
          placeholder="发现的具体问题、位置、现场情况说明"
        />
      </Field>
      <Field label="暗访备注" full>
        <textarea
          rows="2"
          value={form.remark}
          onChange={(event) => setForm((prev) => ({ ...prev, remark: event.target.value }))}
        />
      </Field>
    </Modal>
  );
}
