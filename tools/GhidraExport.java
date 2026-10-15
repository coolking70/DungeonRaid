// Ghidra headless postScript: decompile every function to <outdir>/<addr>_<name>.c and write functions.tsv
// @category Export
import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.*;
import ghidra.program.model.listing.*;
import java.io.*;

public class GhidraExport extends GhidraScript {
    @Override
    public void run() throws Exception {
        File out = new File(getScriptArgs()[0]);
        out.mkdirs();
        DecompInterface ifc = new DecompInterface();
        ifc.setOptions(new DecompileOptions());
        ifc.openProgram(currentProgram);
        try (PrintWriter idx = new PrintWriter(new FileWriter(new File(out, "functions.tsv")))) {
            idx.println("address\tsize\tname\tsignature\tfile");
            for (Function f : currentProgram.getFunctionManager().getFunctions(true)) {
                if (f.isThunk() || f.isExternal()) continue;
                String name = f.getName(true);
                String addr = f.getEntryPoint().toString();
                String safe = name.replaceAll("[^A-Za-z0-9_.~-]+", "_");
                if (safe.length() > 120) safe = safe.substring(0, 120);
                String fn = addr + "_" + safe + ".c";
                DecompileResults r = ifc.decompileFunction(f, 120, monitor);
                String code = (r != null && r.decompileCompleted())
                    ? r.getDecompiledFunction().getC()
                    : "// decompile failed: " + (r == null ? "?" : r.getErrorMessage()) + "\n";
                String sig = f.getSignature().getPrettyString();
                try (PrintWriter w = new PrintWriter(new FileWriter(new File(out, fn)))) {
                    w.println("// " + name + " @ " + addr);
                    w.println("// " + sig);
                    w.print(code);
                }
                idx.println(addr + "\t" + f.getBody().getNumAddresses() + "\t" + name + "\t" + sig.replace('\t', ' ') + "\t" + fn);
            }
        }
        println("exported to " + out);
    }
}
