export interface PublicTrackStage {
  isCompletedForUser: boolean;
  isInProgress: boolean;
  progressWidth: '0%' | '50%' | '100%';
  step2Note: string;
}

/**
 * Maps internal incident workflow status to user-facing /track stepper stages.
 * PENDING_CONFIRM displays as completed so end users can resume work without waiting on Manager sign-off.
 */
export function getPublicTrackStage(status?: string | null): PublicTrackStage {
  const norm = (status || '').trim().toUpperCase();
  const isCompletedForUser = norm === 'PENDING_CONFIRM' || norm === 'RESOLVED' || norm === 'CLOSED';
  const isInProgress = !isCompletedForUser && (norm === 'IN_PROGRESS' || norm === 'ON_HOLD');

  return {
    isCompletedForUser,
    isInProgress,
    progressWidth: isCompletedForUser ? '100%' : isInProgress ? '50%' : '0%',
    step2Note: norm === 'ON_HOLD' ? 'รอข้อมูลเพิ่มเติม' : '',
  };
}
