import type { UseFormReturn } from 'react-hook-form';

import type { SaveAgentSettingsInput } from '@dakly/contracts/ai-agent-settings';
import { Switch } from '@dakly/ui/switch';
import { Textarea } from '@dakly/ui/textarea';

import { AbilitySwitchRow } from './ability-switch-row';
import { SegmentedChoice } from './segmented-choice';

type Form = UseFormReturn<SaveAgentSettingsInput>;
type SectionProps = { form: Form; disabled: boolean };
type ReturnChoice = keyof typeof returnMinutes;

const languages = [
  { value: 'bn', label: 'Bangla' },
  { value: 'en', label: 'English' },
  { value: 'match_customer', label: 'Match customer' },
] as const;

const abilityRows = [
  [
    'answerQuestions',
    'Answer questions',
    'Price, size, stock, delivery and payment — from your products and rules',
  ],
  [
    'showProducts',
    'Show products',
    'Sends product cards with photo, price and sizes, and recognises products from customer photos',
  ],
  [
    'takeOrders',
    'Take orders',
    'Collects name, phone and address, creates the order and sends the receipt',
  ],
  ['confirmOrders', 'Confirm orders', 'Marks the order confirmed when the customer says yes'],
  [
    'suggestAddOns',
    'Suggest add-ons',
    'After the order is confirmed, offers up to two in-stock products from the same category at their shop price',
  ],
  [
    'courierUpdates',
    'Courier updates',
    'Tells customers when the parcel is shipped and out for delivery',
  ],
  ['askForReview', 'Ask for a review', 'Thanks the customer after delivery and asks for a review'],
  [
    'answerComments',
    'Answer post comments',
    'Replies under the comment and sends the price in Messenger',
  ],
] as const;

const handoverRows = [
  ['damagedOrWrong', 'Damaged, wrong or fake product', 'Sends a holding reply and calls you'],
  ['refundsAndExchanges', 'Refunds and exchanges', 'Sends a holding reply and calls you'],
  ['specialRequests', 'Special requests', 'Custom or bulk orders go to you'],
  [
    'discounts',
    'Discount requests',
    'Off: Dakly says the price is fixed, and calls you if the customer asks again',
  ],
] as const;

const followUps = [
  { value: 'off', label: 'Off' },
  { value: 'hot', label: 'Hot only' },
  { value: 'hot_and_warm', label: 'Hot and warm' },
] as const;

const returnChoices = [
  { value: '60', label: 'After 1 hour' },
  { value: '1440', label: 'After 24 hours' },
  { value: 'never', label: 'Until I hand it back' },
] as const;
const returnMinutes = { '60': 60, '1440': 1440, never: null } as const;

const cardStyles = [
  { value: 'buttons', label: 'Cards with buttons' },
  { value: 'text', label: 'Photo and text' },
] as const;

const dirty = { shouldDirty: true } as const;
const sectionLabel = 'mt-6 mb-2 text-xs font-medium tracking-wide text-text-muted uppercase';

export function AgentSettingsFields({ form, disabled }: SectionProps) {
  return (
    <div>
      <ReplySection form={form} disabled={disabled} />
      <AbilitySection form={form} disabled={disabled} />
      <HandoverSection form={form} disabled={disabled} />
    </div>
  );
}

function ReplySection({ form, disabled }: SectionProps) {
  const values = form.watch();
  return (
    <>
      <div className="flex items-center justify-between gap-4 rounded-lg bg-surface-muted p-3">
        <label htmlFor="auto-reply" className="min-w-0 flex-1">
          <span className="block font-semibold">AI auto-reply</span>
          <span className="block text-sm text-text-muted">
            Dakly replies within a minute. You can take over any chat.
          </span>
        </label>
        <Switch
          id="auto-reply"
          checked={values.isAutoReplyOn}
          onCheckedChange={(on) => form.setValue('isAutoReplyOn', on, dirty)}
          disabled={disabled}
        />
      </div>
      <h3 className={sectionLabel}>Reply in</h3>
      <SegmentedChoice
        label="Reply in"
        value={values.replyLanguage}
        options={languages}
        disabled={disabled}
        onChange={(language) => form.setValue('replyLanguage', language, dirty)}
      />
    </>
  );
}

function AbilitySection({ form, disabled }: SectionProps) {
  const abilities = form.watch('abilities');
  return (
    <>
      <h3 className={sectionLabel}>What Dakly does by itself</h3>
      {abilityRows.map(([name, title, description]) => (
        <AbilitySwitchRow
          key={name}
          id={name}
          title={title}
          description={description}
          checked={abilities[name]}
          disabled={disabled}
          onChange={(on) => form.setValue(`abilities.${name}`, on, dirty)}
        />
      ))}
      <div className="py-3">
        <p className="font-semibold">How products are sent</p>
        <p className="mb-2 text-sm text-text-muted">
          Cards show the photo, price and buttons for Order now, See sizes and Talk to a person on
          Messenger and Instagram. WhatsApp always gets photo and text.
        </p>
        <SegmentedChoice
          label="How products are sent"
          value={abilities.productCardStyle}
          options={cardStyles}
          disabled={disabled || !abilities.showProducts}
          onChange={(style) => form.setValue('abilities.productCardStyle', style, dirty)}
        />
      </div>
      <div className="py-3">
        <p className="font-semibold">Remind quiet customers</p>
        <p className="mb-2 text-sm text-text-muted">
          Once, within Meta’s 24-hour window. Hot = asked price or size. Warm = just browsing.
        </p>
        <SegmentedChoice
          label="Remind quiet customers"
          value={abilities.followUp}
          options={followUps}
          disabled={disabled}
          onChange={(level) => form.setValue('abilities.followUp', level, dirty)}
        />
      </div>
    </>
  );
}

function HandoverSection({ form, disabled }: SectionProps) {
  const [rules, minutes] = form.watch(['handoverRules', 'returnToAiMinutes']);
  const returnChoice: ReturnChoice = minutes === null ? 'never' : (String(minutes) as ReturnChoice);
  return (
    <>
      <h3 className={sectionLabel}>Hand to me</h3>
      {handoverRows.map(([name, title, description]) => (
        <AbilitySwitchRow
          key={name}
          id={name}
          title={title}
          description={description}
          checked={rules[name]}
          disabled={disabled}
          onChange={(on) => form.setValue(`handoverRules.${name}`, on, dirty)}
        />
      ))}
      <h3 className={sectionLabel}>Return chat to AI</h3>
      <SegmentedChoice
        label="Return chat to AI"
        value={returnChoice}
        options={returnChoices}
        disabled={disabled}
        onChange={(choice) => form.setValue('returnToAiMinutes', returnMinutes[choice], dirty)}
      />
      <h3 className={sectionLabel}>Extra rules</h3>
      <Textarea
        aria-label="Extra rules"
        rows={3}
        disabled={disabled}
        placeholder="e.g. No discount on sale items"
        {...form.register('extraRules', {
          setValueAs: (text: string | null) => text?.trim() || null,
        })}
      />
    </>
  );
}
