import { EvalRunner } from "@/components/EvalRunner";
import { SttValidator } from "@/components/SttValidator";
import { STT_EVAL_SET } from "@/lib/evalset";
import { LocalizedText } from "@/components/BrowserProfileProvider";

export default function EvalsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold"><LocalizedText id="qualityEvals" /></h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm">
          <LocalizedText id="evalsSubtitle" />
        </p>
      </div>
      <EvalRunner />
      <SttValidator phrases={STT_EVAL_SET} />
    </div>
  );
}
