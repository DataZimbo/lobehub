/** Server-only identity supplied by the runtime for this delivery, never hook configuration. */
export interface HookDeliveryContext {
  readonly ownerUserId: string;
}
