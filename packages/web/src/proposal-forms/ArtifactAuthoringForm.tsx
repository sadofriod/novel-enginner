import { useState, type ComponentType } from 'react';
import { Button, MenuItem, Stack, TextField, Typography } from '@mui/material';

import type { ProposalFormField, ProposalFormFieldType } from './types';
import { serializeFormValues } from './serialize-form';
import type { ProposalFormSpec } from './types';

export interface ArtifactAuthoringFormProps {
  readonly spec: ProposalFormSpec;
  readonly defaultTargetId?: string;
  readonly initialFields?: Readonly<Record<string, unknown>>;
  readonly onSubmit: (payload: Record<string, unknown>) => Promise<{ readonly ok: boolean; readonly message?: string }>;
}

interface SceneDraft {
  readonly id: string;
  readonly content: string;
}

function initialFieldValue(field: ProposalFormField): unknown {
  if (field.defaultValue !== undefined) {
    return field.defaultValue;
  }
  if (field.type === 'list' || field.type === 'rows') {
    return [];
  }
  return '';
}

function buildInitialFields(spec: ProposalFormSpec): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const field of spec.fields) {
    fields[field.name] = initialFieldValue(field);
  }
  return fields;
}

function collectSceneMap(scenes: readonly SceneDraft[]): Record<string, string> {
  return scenes.reduce<Record<string, string>>((map, scene) => {
    if (scene.id.trim().length > 0) {
      map[scene.id.trim()] = scene.content;
    }
    return map;
  }, {});
}

function buildSubmitPayload(
  spec: ProposalFormSpec,
  targetId: string,
  fields: Record<string, unknown>,
  body: string,
  scenes: readonly SceneDraft[],
): Record<string, unknown> | undefined {
  if (targetId.trim().length === 0) {
    return undefined;
  }
  const serialized = serializeFormValues(spec, fields, targetId.trim(), body, collectSceneMap(scenes));
  return {
    targetId: targetId.trim(),
    frontmatter: serialized.frontmatter,
    ...(serialized.sections === undefined ? {} : { sections: serialized.sections }),
    ...(serialized.scenes === undefined ? {} : { scenes: serialized.scenes }),
  };
}

export function ArtifactAuthoringForm({ spec, defaultTargetId = '', initialFields, onSubmit }: ArtifactAuthoringFormProps) {
  const [targetId, setTargetId] = useState(defaultTargetId);
  const [fields, setFields] = useState<Record<string, unknown>>(() => initialFields ?? buildInitialFields(spec));
  const [body, setBody] = useState('');
  const [scenes, setScenes] = useState<SceneDraft[]>([]);
  const [message, setMessage] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const setField = (name: string, value: unknown): void => {
    setFields((previous) => ({ ...previous, [name]: value }));
  };

  const setRowValue = (name: string, index: number, column: string, value: unknown): void => {
    const rows = (fields[name] as Record<string, unknown>[]).slice();
    const row = { ...(rows[index] ?? {}) };
    row[column] = value;
    rows[index] = row;
    setField(name, rows);
  };

  const addRow = (name: string): void => {
    const rows = (fields[name] as Record<string, unknown>[]).slice();
    rows.push({});
    setField(name, rows);
  };

  const removeRow = (name: string, index: number): void => {
    const rows = (fields[name] as Record<string, unknown>[]).slice();
    rows.splice(index, 1);
    setField(name, rows);
  };

  const setScene = (index: number, patch: Partial<SceneDraft>): void => {
    setScenes((previous) => previous.map((scene, sceneIndex) => (sceneIndex === index ? { ...scene, ...patch } : scene)));
  };

  const addScene = (): void => {
    setScenes((previous) => [...previous, { id: '', content: '' }]);
  };

  const removeScene = (index: number): void => {
    setScenes((previous) => previous.filter((_scene, sceneIndex) => sceneIndex !== index));
  };

  const handleSubmit = async (): Promise<void> => {
    const payload = buildSubmitPayload(spec, targetId, fields, body, scenes);
    if (payload === undefined) {
      setMessage('请先填写目标 ID。');
      return;
    }
    setSubmitting(true);
    const result = await onSubmit(payload);
    setSubmitting(false);
    setMessage(result.message);
  };

  return (
    <Stack spacing={2}>
      <Typography variant="h5">{spec.title}</Typography>
      <TextField
        size="small"
        label={spec.targetIdLabel}
        aria-label={spec.targetIdLabel}
        value={targetId}
        onChange={(event) => setTargetId(event.target.value)}
        placeholder={spec.targetIdPlaceholder}
        helperText="此 ID 会成为 canonical 工件与 proposal 的 targetId。"
      />
      {spec.fields.map((field) => <FieldEditor key={field.name} field={field} value={fields[field.name]} onRowChange={setRowValue} onAddRow={addRow} onRemoveRow={removeRow} onChange={setField} />)}
      {spec.scenes === true ? (
        <SceneEditor scenes={scenes} onSetScene={setScene} onAddScene={addScene} onRemoveScene={removeScene} />
      ) : (
        <BodyEditor spec={spec} body={body} onBodyChange={setBody} />
      )}
      <Stack direction="row" spacing={1}>
        <Button variant="contained" onClick={handleSubmit} disabled={submitting}>
          {submitting ? '提交中…' : '生成 Proposal'}
        </Button>
      </Stack>
      <SubmitMessage message={message} />
    </Stack>
  );
}

interface SceneEditorProps {
  readonly scenes: readonly SceneDraft[];
  readonly onSetScene: (index: number, patch: Partial<SceneDraft>) => void;
  readonly onAddScene: () => void;
  readonly onRemoveScene: (index: number) => void;
}

function SceneEditor({ scenes, onSetScene, onAddScene, onRemoveScene }: SceneEditorProps) {
  return (
    <Stack spacing={1}>
      <Typography variant="subtitle1">场景</Typography>
      {scenes.map((scene, index) => (
        <Stack key={index} direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
          <TextField
            size="small"
            label="场景 ID"
            value={scene.id}
            onChange={(event) => onSetScene(index, { id: event.target.value })}
            placeholder="scene-0001"
            style={{ width: 160 }}
          />
          <TextField
            size="small"
            label="场景正文"
            value={scene.content}
            onChange={(event) => onSetScene(index, { content: event.target.value })}
            multiline
            minRows={2}
            style={{ flex: 1 }}
          />
          <Button size="small" onClick={() => onRemoveScene(index)}>移除</Button>
        </Stack>
      ))}
      <Button size="small" onClick={onAddScene}>添加场景</Button>
    </Stack>
  );
}

interface BodyEditorProps {
  readonly spec: ProposalFormSpec;
  readonly body: string;
  readonly onBodyChange: (body: string) => void;
}

function BodyEditor({ spec, body, onBodyChange }: BodyEditorProps) {
  return (
    <TextField
      label={spec.bodyLabel ?? '正文'}
      aria-label={spec.bodyLabel ?? '正文'}
      value={body}
      onChange={(event) => onBodyChange(event.target.value)}
      multiline
      minRows={4}
      placeholder={spec.bodyPlaceholder ?? `填写 ${spec.bodySection} 正文内容。`}
    />
  );
}

function SubmitMessage({ message }: { readonly message: string | undefined }) {
  if (message === undefined) {
    return null;
  }
  return (
    <Typography color={message.startsWith('✔') ? 'success.main' : 'error.main'} role="status">
      {message}
    </Typography>
  );
}

interface FieldEditorProps {
  readonly field: ProposalFormField;
  readonly value: unknown;
  readonly onChange: (name: string, value: unknown) => void;
  readonly onRowChange: (name: string, index: number, column: string, value: unknown) => void;
  readonly onAddRow: (name: string) => void;
  readonly onRemoveRow: (name: string, index: number) => void;
}

function fieldLabel(field: ProposalFormField): string {
  return `${field.label}${field.required === true ? ' *' : ''}`;
}

function SelectField({ field, value, onChange }: FieldEditorProps) {
  const label = fieldLabel(field);
  return (
    <TextField
      select
      size="small"
      label={label}
      aria-label={label}
      value={value ?? ''}
      onChange={(event) => onChange(field.name, event.target.value)}
      helperText={field.helpText}
    >
      {field.options?.map((option) => <MenuItem key={option} value={option}>{option}</MenuItem>)}
    </TextField>
  );
}

function NumberField({ field, value, onChange }: FieldEditorProps) {
  const label = fieldLabel(field);
  return (
    <TextField
      size="small"
      type="number"
      label={label}
      aria-label={label}
      value={value ?? ''}
      onChange={(event) => onChange(field.name, event.target.value)}
      helperText={field.helpText}
    />
  );
}

function TextAreaField({ field, value, onChange }: FieldEditorProps) {
  const label = fieldLabel(field);
  return (
    <TextField
      size="small"
      label={label}
      aria-label={label}
      value={value ?? ''}
      onChange={(event) => onChange(field.name, event.target.value)}
      multiline
      minRows={3}
      helperText={field.helpText}
    />
  );
}

function TextFieldInput({ field, value, onChange }: FieldEditorProps) {
  const label = fieldLabel(field);
  return (
    <TextField
      size="small"
      label={label}
      aria-label={label}
      value={value ?? ''}
      onChange={(event) => onChange(field.name, event.target.value)}
      placeholder={field.placeholder}
      helperText={field.helpText}
    />
  );
}

function ListField({ field, value, onChange }: FieldEditorProps) {
  const label = fieldLabel(field);
  return (
    <TextField
      size="small"
      label={label}
      aria-label={label}
      value={typeof value === 'string' ? value : Array.isArray(value) ? value.join(', ') : ''}
      onChange={(event) => onChange(field.name, event.target.value)}
      placeholder={field.placeholder ?? '逗号分隔多个值'}
      helperText={field.helpText ?? '逗号分隔'}
    />
  );
}

function RowsField({ field, value, onRowChange, onAddRow, onRemoveRow }: FieldEditorProps) {
  const label = fieldLabel(field);
  const rows = Array.isArray(value) ? value as Record<string, unknown>[] : [];
  return (
    <Stack spacing={1}>
      <Typography variant="subtitle1">{label}</Typography>
      {rows.map((row, index) => (
        <Stack key={index} direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
          {field.columns?.map((column) => (
            <TextField
              key={column.name}
              size="small"
              label={column.label}
              value={row[column.name] ?? ''}
              onChange={(event) => onRowChange(field.name, index, column.name, event.target.value)}
              placeholder={column.placeholder}
              style={{ flex: 1, minWidth: 120 }}
            />
          ))}
          <Button size="small" onClick={() => onRemoveRow(field.name, index)}>移除</Button>
        </Stack>
      ))}
      <Button size="small" onClick={() => onAddRow(field.name)}>添加行</Button>
    </Stack>
  );
}

const FIELD_RENDERERS: Readonly<Record<ProposalFormFieldType, ComponentType<FieldEditorProps>>> = {
  select: SelectField,
  number: NumberField,
  textarea: TextAreaField,
  list: ListField,
  rows: RowsField,
  text: TextFieldInput,
};

function FieldEditor(props: FieldEditorProps) {
  const Renderer = FIELD_RENDERERS[props.field.type];
  return <Renderer {...props} />;
}
