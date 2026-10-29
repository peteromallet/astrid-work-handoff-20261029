// Optional bounded ports for isolated local test runs; normal CI uses ephemeral ports.
const selected = process.env.ASTRID_TEST_PORT_RANGE;
const [first, last] = selected ? selected.split('-').map(Number) : [0, 0];
if (!Number.isInteger(first) || !Number.isInteger(last) || first < 0 || last < first || last > 65535 || (selected && first === 0)) {
  throw new Error('ASTRID_TEST_PORT_RANGE must be a port range such as 17680-17689');
}
let next = first;

export async function listenOnTestPort(server) {
  for (let attempt = first; attempt <= last; attempt++) {
    const port = next;
    next = next === last ? first : next + 1;
    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => { server.off('error', reject); resolve(); });
      });
      return server.address().port;
    } catch (error) { if (error.code !== 'EADDRINUSE') throw error; }
  }
  throw new Error(`No test port available in ${selected}`);
}
