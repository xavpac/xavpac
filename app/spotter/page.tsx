import XavPacShell from "../components/shell/XavPacShell";

export const metadata = {
  title: "Spotter — XavPac V2",
  description: "Suivi aéronautique et spotting en direct avec XavPac."
};

export default function SpotterPage() {
  return <XavPacShell universe="spotter" />;
}
