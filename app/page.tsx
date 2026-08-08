import type { Metadata } from "next";
import EnvironmentDashboard from "./environment-dashboard";

export const metadata: Metadata = {
  title: "Atmosphere Now",
  description:
    "Live weather, air quality, and device-aware environmental readings for your current location.",
};

export default function Home() {
  return <EnvironmentDashboard />;
}
