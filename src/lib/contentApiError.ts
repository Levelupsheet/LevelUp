/** Keep infrastructure failures actionable without exposing database connection details. */
export function contentApiError(error: any) {
  if (['P2021', 'P2022'].includes(error?.code)) return 'Content database schema is out of date. On the server run npm run deploy:build, then restart the application.';
  if (['P1001', 'P1002', 'P1017'].includes(error?.code)) return 'Content database is unavailable. Check the server database connection and retry.';
  return 'Could not load question content. Check the server logs and confirm migrations and Prisma generation completed.';
}
