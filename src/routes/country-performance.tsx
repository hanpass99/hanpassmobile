import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { COUNTRIES, CUSTOMERS, computeStats } from "@/lib/mock-data";

export const Route = createFileRoute("/country-performance")({
  head: () => ({ meta: [{ title: "국가별 성과 — Hanpass OB CRM" }] }),
  component: CountryPerf,
});

function CountryPerf() {
  const rows = COUNTRIES.map((co) => {
    const cs = computeStats(CUSTOMERS.filter((c) => c.country === co.code));
    return { ...co, ...cs };
  }).sort((a, b) => b.activated - a.activated);

  return (
    <div className="space-y-5">
      <PageHeader title="국가별 성과" description="국가별 콜 및 개통 실적" />
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>국가</TableHead>
                <TableHead className="text-right">전체 콜</TableHead>
                <TableHead className="text-right">성공</TableHead>
                <TableHead className="text-right">실패</TableHead>
                <TableHead className="text-right">부재중</TableHead>
                <TableHead className="text-right">개통 완료</TableHead>
                <TableHead className="text-right">성공률</TableHead>
                <TableHead className="text-right">개통률</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.code}>
                  <TableCell>
                    <span className="font-mono text-xs font-bold text-primary">{c.code}</span>
                    <span className="ml-2 text-sm">{c.name}</span>
                  </TableCell>
                  <TableCell className="text-right font-medium">{c.totalCalls}</TableCell>
                  <TableCell className="text-right text-success">{c.success}</TableCell>
                  <TableCell className="text-right text-destructive">{c.failed}</TableCell>
                  <TableCell className="text-right">{c.missed}</TableCell>
                  <TableCell className="text-right font-semibold text-primary">{c.activated}</TableCell>
                  <TableCell className="text-right">{c.successRate.toFixed(1)}%</TableCell>
                  <TableCell className="text-right">{c.activationRate.toFixed(1)}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
