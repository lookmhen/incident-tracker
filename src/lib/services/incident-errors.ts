export class IncidentServiceError extends Error {
  constructor(
    message: string,
    public status: number = 400
  ) {
    super(message);
    this.name = 'IncidentServiceError';
  }
}
