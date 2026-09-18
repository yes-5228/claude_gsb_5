import { useState } from 'react';

import Field from '../../components/Field.jsx';
import Modal from '../../components/Modal.jsx';
import { StatusTag } from '../../components/Tags.jsx';

export default function TaskActionModal({ option, task, saving, onClose, onSubmit }) {
  const [operator, setOperator] = useState(task.inspector || '');
  const [remark, setRemark] = useState('');

  const submit = (event) => {
    event.preventDefault();
    if (!operator.trim()) return;
    onSubmit({ to_status: option.status, operator: operator.trim(), remark: remark || null });
  };

  return (
    <Modal
      title={`任务处理 - ${option.action}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
          <button type="submit" form="task-action" className="btn btn-primary" disabled={saving}>
            {saving ? '提交中…' : '确认提交'}
          </button>
        </>
      }
    >
      <div className="alert alert-info">
        任务状态 <StatusTag status={task.status} /> 变更为 <StatusTag status={option.status} />
      </div>
      <form id="task-action" className="form-grid" onSubmit={submit}>
        <Field label="操作人 *">
          <input value={operator} onChange={(event) => setOperator(event.target.value)} placeholder="如：暗访项目负责人" />
        </Field>
        <Field label="处理说明" full>
          <textarea rows="3" value={remark} onChange={(event) => setRemark(event.target.value)} placeholder="填写本次任务处理说明" />
        </Field>
      </form>
    </Modal>
  );
}
