import type { Metadata } from "next";
import { getConceptGraph } from "@/lib/content";
import { NavBar } from "@/components/NavBar";
import { ConceptSkillTree } from "@/components/ConceptSkillTree";

export const metadata: Metadata = { title: "Skill Tree" };

export default async function LearnPage() {
  const graph = await getConceptGraph();
  return (
    <div className="h-dvh flex flex-col overflow-hidden">
      <NavBar />
      <ConceptSkillTree graph={graph} />
    </div>
  );
}
