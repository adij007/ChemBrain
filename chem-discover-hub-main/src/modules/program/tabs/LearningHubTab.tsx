import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ChevronDown, BookOpen } from 'lucide-react';

const TEMPLATES = {
  beginner: [
    { title: 'What is a drug target?', body: 'A drug target is a molecule (typically a protein) whose modulation by a drug produces a therapeutic effect…' },
    { title: 'Reading a confidence score', body: 'Confidence scores combine literature support, structural evidence, and bioactivity. >0.75 is high confidence.' },
  ],
  intermediate: [
    { title: 'Mechanism of Action (MoA) classes', body: 'Inhibitors, agonists, antagonists, modulators, degraders…' },
    { title: 'Building a focused query', body: 'Combine disease + target family + MoA for narrower candidate sets.' },
  ],
  advanced: [
    { title: 'Interpreting MD trajectories', body: 'RMSD, RMSF, hydrogen-bond persistence, binding free energy estimates…' },
    { title: 'Cross-referencing evidence chains', body: 'Triangulating Open Targets + ChEMBL bioactivity + clinical PubMed signals.' },
  ],
};

const GLOSSARY = [
  { term: 'Mechanism of Action', def: 'The biochemical interaction through which a drug produces its pharmacological effect.' },
  { term: 'Bioactivity', def: 'A measure of how a substance affects living matter; commonly IC50, Ki, EC50.' },
  { term: 'ADMET', def: 'Absorption, Distribution, Metabolism, Excretion, and Toxicity.' },
  { term: 'Target validation', def: 'Evidence that modulating a target produces the desired phenotypic outcome.' },
  { term: 'Lead compound', def: 'A chemical compound that has shown sufficient promise to advance to optimization.' },
];

export function LearningHubTab() {
  const [level, setLevel] = useState<'beginner' | 'intermediate' | 'advanced'>('beginner');
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2 p-6 space-y-4">
        <div className="flex items-center gap-3">
          <BookOpen className="size-5 text-primary" />
          <h3 className="font-semibold">Guided walkthroughs</h3>
        </div>
        <ToggleGroup type="single" value={level} onValueChange={(v) => v && setLevel(v as any)}>
          <ToggleGroupItem value="beginner">Beginner</ToggleGroupItem>
          <ToggleGroupItem value="intermediate">Intermediate</ToggleGroupItem>
          <ToggleGroupItem value="advanced">Advanced</ToggleGroupItem>
        </ToggleGroup>
        <div className="space-y-2">
          {TEMPLATES[level].map((t, i) => (
            <Collapsible key={i} className="rounded border">
              <CollapsibleTrigger className="flex w-full items-center justify-between p-3 text-left text-sm font-medium hover:bg-accent/40">
                {t.title}<ChevronDown className="size-4" />
              </CollapsibleTrigger>
              <CollapsibleContent className="px-3 pb-3 text-sm text-muted-foreground">{t.body}</CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      </Card>
      <Card className="p-4">
        <h3 className="font-semibold mb-3">Glossary</h3>
        <Accordion type="multiple">
          {GLOSSARY.map((g) => (
            <AccordionItem key={g.term} value={g.term}>
              <AccordionTrigger className="text-sm">{g.term}</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">{g.def}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </Card>
    </div>
  );
}
