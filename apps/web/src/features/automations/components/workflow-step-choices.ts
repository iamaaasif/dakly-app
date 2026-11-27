import {
  Camera,
  Clock,
  Lock,
  type LucideIcon,
  MessageCircle,
  MessageSquareText,
  MessagesSquare,
  Reply,
  Split,
  Tag,
} from 'lucide-react';

import type { NewStepKind } from '../workflow-graph-edit';

export const stepChoices: {
  kind: NewStepKind;
  label: string;
  icon: LucideIcon;
  group: 'Messages' | 'Comment replies' | 'Flow actions';
}[] = [
  { kind: 'sms', label: 'SMS', icon: MessageSquareText, group: 'Messages' },
  { kind: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, group: 'Messages' },
  { kind: 'messenger', label: 'Messenger', icon: MessagesSquare, group: 'Messages' },
  { kind: 'instagram', label: 'Instagram DM', icon: Camera, group: 'Messages' },
  { kind: 'private_reply', label: 'Send private reply', icon: Lock, group: 'Comment replies' },
  { kind: 'public_reply', label: 'Reply to comment', icon: Reply, group: 'Comment replies' },
  { kind: 'delay', label: 'Delay', icon: Clock, group: 'Flow actions' },
  { kind: 'tag', label: 'Tag contact', icon: Tag, group: 'Flow actions' },
  { kind: 'split', label: 'Conditional split', icon: Split, group: 'Flow actions' },
];

// Dragging a palette item onto an add button carries its kind.
export const dragType = 'application/x-dakly-step';
