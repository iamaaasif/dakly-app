export const stageLabel = (stage: string) =>
  stage === 'to_confirm' ? 'To confirm' : stage === 'to_pack' ? 'To pack' : 'Other';
