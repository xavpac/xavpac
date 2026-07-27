import XavPacShell from "../components/shell/XavPacShell";

export const metadata = {
  title: "Drone — XavPac V2",
  description: "Assistant de préparation de vol Drone XavPac."
};

export default function DronePage() {
  return <XavPacShell universe="drone" />;
}
