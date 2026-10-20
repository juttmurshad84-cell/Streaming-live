import { becomeStreamerAction } from "@/app/actions/profile";
import { ActionForm, Checkbox, SubmitButton } from "./forms";

export function StreamerOptIn() {
  return (
    <ActionForm action={becomeStreamerAction} className="space-y-4">
      <p className="text-sm text-muted">Enable streaming to broadcast from your browser or an encoder like OBS, schedule events and publish replays.</p>
      <Checkbox name="rights" label="I will only broadcast content I own or have permission to broadcast." description="I accept responsibility for my streams, including sports footage, music and commentary, and agree to the Terms, Community Guidelines and Copyright Policy. Unauthorized rebroadcasts of TV feeds are prohibited." />
      <SubmitButton pendingLabel="Enabling…">Become a streamer</SubmitButton>
    </ActionForm>
  );
}
