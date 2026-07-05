import { EvalRunner } from "@/components/EvalRunner";
import { SttValidator } from "@/components/SttValidator";
import { STT_EVAL_SET } from "@/lib/evalset";

export default function EvalsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Quality evals</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm">
          Validate translation quality across models and check how well voice recognition hears you.
        </p>
      </div>
      <EvalRunner />
      <SttValidator phrases={STT_EVAL_SET} />
    </div>
  );
}
