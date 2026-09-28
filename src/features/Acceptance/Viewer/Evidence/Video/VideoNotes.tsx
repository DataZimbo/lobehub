'use client';

import { isFullFrameRect } from '@lobechat/const/verify';
import { Flexbox, Icon } from '@lobehub/ui';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import { Flag, Repeat } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { DraftAnnotationEntry } from '../../Review/rejectDraft';
import { RegionNoteRow } from '../RegionNotes';
import { CLAIM_COLOR } from './styles';
import { formatVideoTime, frameOf } from './videoTime';

const styles = createStaticStyles(({ css }) => ({
  stamp: css`
    cursor: pointer;

    display: inline-flex;
    gap: 4px;
    align-items: center;

    padding-block: 1px;
    padding-inline: 6px;
    border: none;
    border-radius: 4px;

    font-family: ${cssVar.fontFamilyCode};
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    color: ${cssVar.colorErrorText};

    background: ${cssVar.colorErrorBg};

    &:hover {
      background: ${cssVar.colorErrorBgHover};
    }
  `,
  active: css`
    box-shadow: 0 0 0 1px ${cssVar.colorError};
  `,
  quote: css`
    padding-block: 4px;
    padding-inline: 8px;
    border-inline-start: 3px solid;
    border-radius: 4px;

    font-size: 12px;
    color: ${cssVar.colorTextSecondary};

    background: ${cssVar.colorFillQuaternary};
  `,
}));

interface VideoNotesProps {
  activeNoteKey?: number;
  notes: DraftAnnotationEntry[];
  onChange: (key: number, comment: string) => void;
  onFocusNote: (note: DraftAnnotationEntry) => void;
  onRemove: (key: number) => void;
}

/**
 * The notes on the video on screen, in the order they occur. Each names its
 * frame or span — clicking it seeks there — and a dispute quotes the agent's
 * claim it answers, so the note reads on its own in the next round.
 */
export const VideoNotes = ({
  activeNoteKey,
  notes,
  onChange,
  onFocusNote,
  onRemove,
}: VideoNotesProps) => {
  const { t } = useTranslation('verify');
  const sorted = notes.filter((note) => note.time).sort((a, b) => a.time!.start - b.time!.start);

  return sorted.map((note, index) => {
    const time = note.time!;
    const span = time.end !== undefined;
    let placeholder = t('acceptance.video.notePlaceholderFrame');
    if (note.disputes) placeholder = t('acceptance.video.notePlaceholderDispute');
    else if (span) placeholder = t('acceptance.video.notePlaceholderRange');
    let detail = t('acceptance.video.frame', { frame: frameOf(time.start) });
    if (span)
      detail = t('acceptance.video.rangeSeconds', { seconds: (time.end! - time.start).toFixed(1) });
    else if (!isFullFrameRect(note.rect)) detail += ` · ${t('acceptance.video.circled')}`;

    return (
      <RegionNoteRow
        autoFocus={note.key === activeNoteKey && !note.comment}
        index={index + 1}
        key={note.key}
        placeholder={placeholder}
        value={note.comment}
        caption={
          <Flexbox gap={6}>
            <Flexbox horizontal align={'center'} gap={6}>
              <button
                className={cx(styles.stamp, note.key === activeNoteKey && styles.active)}
                type={'button'}
                onClick={() => onFocusNote(note)}
              >
                <Icon icon={span ? Repeat : Flag} size={11} />
                {span
                  ? `${formatVideoTime(time.start)} – ${formatVideoTime(time.end!)}`
                  : formatVideoTime(time.start)}
              </button>
              <span style={{ color: cssVar.colorTextTertiary, fontSize: 11 }}>{detail}</span>
            </Flexbox>
            {note.disputes && (
              <div
                className={styles.quote}
                style={{ borderColor: CLAIM_COLOR[note.disputes.kind] }}
              >
                <span style={{ color: CLAIM_COLOR[note.disputes.kind], fontWeight: 600 }}>
                  {t(`acceptance.video.claim.${note.disputes.kind}`)}
                </span>{' '}
                {note.disputes.note}
              </div>
            )}
          </Flexbox>
        }
        onChange={(comment) => onChange(note.key, comment)}
        onRemove={() => onRemove(note.key)}
      />
    );
  });
};
