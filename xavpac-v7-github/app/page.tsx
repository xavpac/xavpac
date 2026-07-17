import Dashboard from "./components/Dashboard";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function HomePage({ searchParams }: PageProps) {
  const params = await searchParams;
  return <Dashboard initialDemo={params.demo === "1"} />;
}
