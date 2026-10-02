import type { Metadata } from "next";
import { MyPlans } from "@/components/my-plans";
import { PlanBuilder } from "@/components/plan-builder";

export const metadata: Metadata = { title: "Plans · Firstshare" };

export default function PlansPage() {
  return (
    <div className="pt-8">
      <h1 className="text-title">Make a plan</h1>
      <p className="mt-4 max-w-xl text-lg text-muted">
        Say how you want to invest, in your own words. We turn it into clear rules, show how it would have done on past prices, and check
        every buy against the real New York price.
      </p>
      <div className="mt-10 max-w-3xl">
        <PlanBuilder />
      </div>
      <MyPlans />
    </div>
  );
}
