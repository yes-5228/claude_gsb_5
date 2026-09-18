import { useEffect, useMemo, useState } from 'react';

import { mysteryTaskApi, mysteryVisitApi } from '../../api/mystery.js';
import { metaApi } from '../../api/meta.js';
import Field from '../../components/Field.jsx';
import Modal from '../../components/Modal.jsx';
import { GradeTag, StatusTag } from '../../components/Tags.jsx';
import { useToast } from '../../components/Toast.jsx';
import { useDictionaries } from '../../hooks/useDictionaries.js';
import { toDateTimeInput } from '../../utils/format.js';
import { calcScore, gradeOf, resultOf } from '../../utils/scoring.js';

export default function MysteryVisitFormModal({ defaultTaskId, onClose, onSaved }) {
  const { dictionaries } = useDictionaries();
  const toast = useToast();
  const [tasks, setTasks] = useState([]);
  const [restrooms, setRestrooms] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    task_id: defaultTaskId ? Number(defaultTaskId) : '',
    restroom_id: '',
    visit_time: toDateTimeInput(),
    imagesText: '',
    problem_note: '',
  });
  const [items, setItems] = useState([]);

  // 加载进行中的暗访任务与公厕选项
  useEffect(() => {
    Promise.all([mysteryTaskApi.list({ page_size: 100 }), metaApi.restroomOptions()])
      .then(([taskPage, options]) => {
        setTasks(taskPage.items.filter((task) => ['待执行', '进行中'].includes(task.status)));
        setRestrooms(options);
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    const template = dictionaries?.inspection_check_items || [];
    setItems(template.map((name) => ({ name, score: 9, remark: '' })));
  }, [dictionaries]);

  const activeTask = useMemo(
    () => tasks.find((task) => task.id === Number(form.task_id)) || null,
    [tasks, form.task_id],
  );

  // 公厕选项限定在任务区域内，与后端校验一致
  const restroomOptions = useMemo(
    () => (activeTask ? restrooms.filter((item) => item.district === activeTask.district) : []),
    [restrooms, activeTask],
  );

  const score = useMemo(() => calcScore(items), [items]);
  const grade = gradeOf(score);
  const result = resultOf(items, score);

  const setValue = (key) => (event) =>
    setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const setItemScore = (index, value) => {
    setItems((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, score: Number(value) } : item)),
    );
  };

  const setItemRemark = (index, value) => {
    setItems((prev) => prev.map((item, idx) => (idx === index ? { ...item, remark: value } : item)));
  };

  const fillAll = (value) => setItems((prev) => prev.map((item) => ({ ...item, score: value })));

  const submit = async (event) => {
    event.preventDefault();
    if (!form.task_id) {
      setError('请选择暗访任务');
      return;
    }
    if (!form.restroom_id) {
      setError('请选择被暗访的公厕');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await mysteryVisitApi.create({
        task_id: Number(form.task_id),
        restroom_id: Number(form.restroom_id),
        visit_time: form.visit_time ? new Date(form.visit_time).toISOString() : null,
        items,
        images: form.imagesText
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
        problem_note: form.problem_note.trim() || null,
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
      width={880}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
          <button type="submit" form="mystery-visit-form" className="btn btn-primary" disabled={saving}>
            {saving ? '提交中…' : '提交暗访记录'}
          </button>
        </>
      }
    >
      {error ? <div className="alert alert-error">{error}</div> : null}
      <form id="mystery-visit-form" onSubmit={submit} className="form-grid">
        <Field label="暗访任务 *" full>
          <select
            value={form.task_id}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, task_id: event.target.value, restroom_id: '' }))
            }
          >
            <option value="">请选择任务</option>
            {tasks.map((task) => (
              <option key={task.id} value={task.id}>
                {task.title}（{task.district} · {task.period} · {task.inspector}）
              </option>
            ))}
          </select>
        </Field>
        <Field label="被暗访公厕 *" hint={activeTask ? `仅限${activeTask.district}内公厕` : '请先选择任务'}>
          <select
            value={form.restroom_id}
            onChange={setValue('restroom_id')}
            disabled={!activeTask}
          >
            <option value="">请选择公厕</option>
            {restroomOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.code} {option.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="暗访时间">
          <input
            type="datetime-local"
            value={form.visit_time}
            onChange={setValue('visit_time')}
          />
        </Field>
      </form>

      <div className="card-title">
        <div className="inline">
          <h3>统一评分表（每项 0-10 分）</h3>
          <span className="tag tag-primary">当前得分 {score.toFixed(1)}</span>
          <GradeTag grade={grade} />
          <StatusTag status={result} />
        </div>
        <div className="inline">
          <button type="button" className="btn btn-sm" onClick={() => fillAll(10)}>
            全部满分
          </button>
          <button type="button" className="btn btn-sm" onClick={() => fillAll(8)}>
            全部良好
          </button>
        </div>
      </div>

      <div className="check-grid">
        {items.map((item, index) => (
          <div className={`check-item${item.score < 6 ? ' is-low' : ''}`} key={item.name}>
            <div className="name">{item.name}</div>
            <div className="score-line">
              <input
                type="range"
                min="0"
                max="10"
                step="1"
                value={item.score}
                onChange={(event) => setItemScore(index, event.target.value)}
              />
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

      <Field label="现场影像" hint="每行一个图片链接" full>
        <textarea
          rows="3"
          value={form.imagesText}
          onChange={setValue('imagesText')}
          placeholder={'https://example.com/photo-1.jpg\nhttps://example.com/photo-2.jpg'}
        />
      </Field>
      <Field label="问题说明" full>
        <textarea
          rows="2"
          value={form.problem_note}
          onChange={setValue('problem_note')}
          placeholder="暗访发现的问题与现场情况说明"
        />
      </Field>
    </Modal>
  );
}
