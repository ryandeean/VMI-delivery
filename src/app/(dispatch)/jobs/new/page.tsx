import JobForm from "@/components/JobForm";
import { BackLink, PageHeader } from "@/components/ui";
import { getSettings } from "@/lib/services/settings";
import { isValidDateString, todayString } from "@/lib/time";

export default async function NewJobPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams;
  const settings = await getSettings();
  const day = isValidDateString(date) ? date : todayString(settings.timezone);
  return (
    <div className="mx-auto max-w-5xl">
      <BackLink href={`/?date=${day}`}>Back to the board</BackLink>
      <PageHeader title="Add a job" subtitle="For anything not in Current RMS, such as a one-off collection or a favour for a client." />
      <JobForm date={day} tz={settings.timezone} defaultServiceMinutes={settings.defaultServiceMinutes} />
    </div>
  );
}
