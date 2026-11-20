import { Button } from '@dakly/ui/button';
import { Label } from '@dakly/ui/label';
import { Textarea } from '@dakly/ui/textarea';

import { topicIdeas } from '../content-studio-labels';
import type { GenerateForm } from './generate-form-types';

export function TopicField({ form }: { form: GenerateForm }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="content-topic">What’s it about?</Label>
      <Textarea
        id="content-topic"
        rows={3}
        maxLength={2000}
        placeholder="e.g. New winter kurtis, 15% off this weekend, cash on delivery"
        {...form.register('topic', { setValueAs: (text: string) => text.trim() || undefined })}
      />
      <div className="flex flex-wrap gap-2">
        {topicIdeas.map((idea) => (
          <Button
            key={idea}
            type="button"
            variant="secondary"
            onClick={() => form.setValue('topic', idea)}
          >
            {idea}
          </Button>
        ))}
      </div>
    </div>
  );
}
