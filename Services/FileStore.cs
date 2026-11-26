namespace HemStore.Services
{
    /// <summary>
    /// Uploaded files. Product photos are public (shown in the shop); delivery photos, invoices and
    /// vendor documents are private and are only sent through checked API calls.
    /// The type is checked from the file's first bytes, not from its name.
    /// </summary>
    public class FileStore
    {
        public const long MaxBytes = 5 * 1024 * 1024;
        private readonly string _root;

        public FileStore(IConfiguration config, IWebHostEnvironment env)
        {
            string folder = config["HemStore:UploadFolder"] ?? "App_Data";
            _root = Path.GetFullPath(Path.IsPathRooted(folder) ? folder : Path.Combine(env.ContentRootPath, folder));
        }

        public enum Kind { Image, Pdf, ImageOrPdf }

        private static string? Detect(byte[] head)
        {
            if (head.Length >= 3 && head[0] == 0xFF && head[1] == 0xD8 && head[2] == 0xFF) return ".jpg";
            if (head.Length >= 8 && head[0] == 0x89 && head[1] == 0x50 && head[2] == 0x4E && head[3] == 0x47) return ".png";
            if (head.Length >= 12 && head[0] == 'R' && head[1] == 'I' && head[2] == 'F' && head[3] == 'F' && head[8] == 'W' && head[9] == 'E' && head[10] == 'B' && head[11] == 'P') return ".webp";
            if (head.Length >= 5 && head[0] == '%' && head[1] == 'P' && head[2] == 'D' && head[3] == 'F' && head[4] == '-') return ".pdf";
            return null;
        }

        /// <summary>Saves an upload into a sub-folder and returns the stored file name.</summary>
        public async Task<string> SaveAsync(IFormFile? file, string folder, Kind kind, string label)
        {
            if (file == null || file.Length == 0) throw new StoreException($"Please add the {label}.");
            if (file.Length > MaxBytes) throw new StoreException($"The {label} must be 5 MB or smaller.");

            var head = new byte[12];
            await using (var s = file.OpenReadStream()) { int n = await s.ReadAsync(head); Array.Resize(ref head, n); }
            string? ext = Detect(head);
            bool ok = ext != null && kind switch
            {
                Kind.Image => ext != ".pdf",
                Kind.Pdf => ext == ".pdf",
                _ => true
            };
            if (!ok) throw new StoreException(kind switch
            {
                Kind.Image => $"The {label} must be a JPG, PNG or WEBP photo.",
                Kind.Pdf => $"The {label} must be a PDF file.",
                _ => $"The {label} must be a PDF or a JPG/PNG/WEBP photo."
            });

            string dir = Path.Combine(_root, folder);
            Directory.CreateDirectory(dir);
            string name = Guid.NewGuid().ToString("N") + ext;
            await using (var o = File.Create(Path.Combine(dir, name))) await file.CopyToAsync(o);
            return name;
        }

        /// <summary>Full path of a stored file, or null (also for anything that tries to leave the folder).</summary>
        public string? PathOf(string folder, string? name)
        {
            if (string.IsNullOrEmpty(name) || name.Contains('/') || name.Contains('\\') || name.Contains("..")) return null;
            string p = Path.GetFullPath(Path.Combine(_root, folder, name));
            return p.StartsWith(Path.Combine(_root, folder) + Path.DirectorySeparatorChar, StringComparison.Ordinal) && File.Exists(p) ? p : null;
        }

        public static string ContentType(string path) => Path.GetExtension(path).ToLowerInvariant() switch
        {
            ".jpg" => "image/jpeg",
            ".png" => "image/png",
            ".webp" => "image/webp",
            ".pdf" => "application/pdf",
            _ => "application/octet-stream"
        };
    }
}
