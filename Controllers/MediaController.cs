using HemStore.Services;
using Microsoft.AspNetCore.Mvc;

namespace HemStore.Controllers
{
    /// <summary>Product photos are public (they are shown in the shop). Other uploads are served by the role controllers.</summary>
    [ApiController]
    public class MediaController : ControllerBase
    {
        private readonly FileStore _files;
        public MediaController(FileStore files) => _files = files;

        [HttpGet("media/products/{name}")]
        public IActionResult Product(string name)
        {
            var path = _files.PathOf("products", name);
            if (path == null) return NotFound();
            Response.Headers.CacheControl = "public, max-age=604800, immutable";
            return PhysicalFile(path, FileStore.ContentType(path));
        }
    }
}
