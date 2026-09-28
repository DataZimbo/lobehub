import { isFullFrameRect } from '@lobechat/const/verify';
import type { AcceptanceReviewAnnotation } from '@lobechat/types';

// Regions are normalized 0-1; percentages read better to a model than raw floats.
const pct = (value: number) => `${Math.round(value * 100)}%`;

const seconds = (value: number) => `${Number(value.toFixed(2))}s`;

/**
 * One reviewer annotation as a prompt line: where it points (image frame label,
 * video moment, circled region) and what the reviewer said about it.
 */
export const renderAnnotationRegion = (annotation: AcceptanceReviewAnnotation, frame?: string) => {
  const { disputes, rect, time } = annotation;
  let when = '';
  if (time)
    when =
      time.end === undefined
        ? ` at ${seconds(time.start)} into the video`
        : ` from ${seconds(time.start)} to ${seconds(time.end)} of the video`;
  // A video note over the whole frame marks a moment, not an area.
  const at =
    rect && !(time && isFullFrameRect(rect))
      ? ` at ${pct(rect.x)},${pct(rect.y)} sized ${pct(rect.width)}×${pct(rect.height)}`
      : '';
  const disputed = disputes?.note
    ? ` (disputing the agent's ${disputes.kind}: "${disputes.note}")`
    : '';
  return `  ${time ? 'marked' : 'circled'}${frame ? ` on ${frame}` : ''}${when}${at}${disputed}: ${annotation.comment?.trim() || '(no note)'}`;
};
