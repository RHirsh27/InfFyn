import { MonthlyWorkspace } from "@/components/monthly/workspace";

export const metadata = {
  title: "Company demonstration | InfFyn",
  robots: { index: false, follow: false },
};
export default function CompanyDemoPage() {
  return <MonthlyWorkspace demo />;
}
