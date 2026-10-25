import { navigate, useRoute } from '../router'

interface Guide {
  slug: string
  title: string
  summary: string
  body: React.ReactNode
}

export default function Guides() {
  const route = useRoute()
  const slug = route.startsWith('/guides/') ? route.slice('/guides/'.length) : ''
  const guide = GUIDES.find((g) => g.slug === slug)

  if (guide) {
    return (
      <article className="guide">
        <button type="button" className="link-btn" onClick={() => navigate('/guides')}>
          ← All guides
        </button>
        <h1 className="guide-title">{guide.title}</h1>
        <div className="guide-body">{guide.body}</div>
        <div className="cta-band">
          <h2>Put it into practice</h2>
          <div className="actions actions-center">
            <button type="button" className="btn btn-primary" onClick={() => navigate('/optimize')}>
              Optimize a video →
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/check')}>
              Check a post
            </button>
          </div>
        </div>
      </article>
    )
  }

  return (
    <>
      <section className="hero">
        <p className="eyebrow">Nova · guides</p>
        <h1>How to keep your quality.</h1>
        <p className="lede">
          Plain-language walkthroughs of the whole chain: export settings that survive the trip, why the platforms
          compress your video, and how to check what viewers are really served.
        </p>
      </section>
      <section className="panel">
        <div className="guide-list">
          {GUIDES.map((g) => (
            <button key={g.slug} type="button" className="guide-card" onClick={() => navigate(`/guides/${g.slug}`)}>
              <h3>{g.title}</h3>
              <p className="muted">{g.summary}</p>
              <span className="link-btn">Read →</span>
            </button>
          ))}
        </div>
      </section>
    </>
  )
}

const GUIDES: Guide[] = [
  {
    slug: 'upload-in-high-quality',
    title: 'Upload in high quality, with the least compression',
    summary: 'The full chain: export at source quality, turn on Upload HD, optimize, then prove it held.',
    body: (
      <>
        <p>
          High quality on social isn’t one setting, it’s a chain. Film clean, export at your source quality, turn on
          Upload HD, and run the file through Nova so it arrives in spec. Then check that it survived. Skip any link
          and the platform claws quality back.
        </p>
        <h2>Step 1 — Export settings that survive the trip</h2>
        <ul>
          <li>
            <strong>Resolution:</strong> vertical 9:16 at your source quality, 1080×1920 up to 4K. If your footage
            isn’t 9:16, frame it to 9:16 before export so the platform doesn’t crop and rescale it for you.
          </li>
          <li>
            <strong>Frame rate:</strong> match your source, up to 60 fps. Don’t invent frames a 30 fps clip never had.
          </li>
          <li>
            <strong>Bitrate:</strong> the highest your editor allows, around 15 to 25 Mbps for 1080p60. Higher gives
            the platform less reason to smear detail.
          </li>
          <li>
            <strong>Codec:</strong> H.264 or HEVC in an MP4. Skip the “recommended” or “TikTok” presets, which are
            tuned for small files, not quality.
          </li>
        </ul>
        <h2>Step 2 — Turn on Upload HD</h2>
        <p>
          On the post screen, open <strong>More options</strong> and switch on <strong>Upload HD</strong>. Without it,
          the platform uploads a lower-quality copy no matter how good your file is. Some app versions quietly reset
          it, so check every time.
        </p>
        <h2>Step 3 — Optimize before you post</h2>
        <p>
          Good settings raise the <em>input</em> quality, but they don’t change how the platform’s servers read your
          file. Nova rebuilds the file to each platform’s ingest spec, on your device, so the servers do the least
          damage. Drop your export into <button type="button" className="inline-link" onClick={() => navigate('/optimize')}>Optimize</button>, download the result, and post that.
        </p>
        <p>
          One habit that quietly kills quality: don’t move the file through apps that recompress video (WhatsApp,
          Messenger, most email) between exporting and posting. Use a cable, AirDrop or cloud storage.
        </p>
        <h2>Step 4 — Prove it held</h2>
        <p>
          “Looks sharper” is a feeling; proof is a number. Save the posted clip back to your device and run it through
          the <button type="button" className="inline-link" onClick={() => navigate('/check')}>Check</button> page to
          read the resolution, frame rate and bitrate the platform actually serves.
        </p>
      </>
    ),
  },
  {
    slug: 'why-platforms-compress',
    title: 'Why TikTok, Instagram and Facebook compress your video',
    summary: 'Every upload is re-encoded on their servers. Here’s what that does and why it happens.',
    body: (
      <>
        <p>
          Every video you upload is re-encoded on the platform’s servers into streaming versions. Nobody is ever
          served your original file. That re-encode is what turns a razor-sharp edit soft, however high you exported.
        </p>
        <h2>What actually happens to your file</h2>
        <p>
          When your upload lands, the platform decodes it and re-compresses it into a ladder of streaming renditions
          at different resolutions and bitrates, then serves whichever one fits the viewer’s screen and connection.
          Those renditions are capped far below a clean master: most viewers are served around 1080p, often at only a
          few Mbps.
        </p>
        <h2>Why they do it</h2>
        <ul>
          <li>
            <strong>Bandwidth.</strong> Billions of plays a day. Smaller files cost less to store and deliver.
          </li>
          <li>
            <strong>Consistency.</strong> One known format plays on every device without buffering.
          </li>
          <li>
            <strong>Prediction.</strong> Platforms spend their best encodes on videos they expect people to watch, so
            a new post can look worse in its first minutes until a better encode lands.
          </li>
        </ul>
        <h2>What you can control</h2>
        <p>
          You can’t switch the re-encode off, but you decide what goes in. A high-bitrate, in-spec, correctly sized
          file gives the platform the cleanest starting point, which is the whole job of <button type="button" className="inline-link" onClick={() => navigate('/optimize')}>Nova’s optimizer</button>.
        </p>
      </>
    ),
  },
  {
    slug: 'check-quality-after-posting',
    title: 'How to check your video quality after posting',
    summary: 'The file in your camera roll isn’t what viewers see. Measure the delivered copy.',
    body: (
      <>
        <p>
          The version of your video in your camera roll is not the version the platform shows the world. The only way
          to know what viewers get is to measure the delivered file.
        </p>
        <h2>How to do it</h2>
        <ol>
          <li>Open your post and save it back to your device (download, or screen-record at full quality).</li>
          <li>
            Drop that file into the <button type="button" className="inline-link" onClick={() => navigate('/check')}>Check</button> page, and add your original export too.
          </li>
          <li>Read the delivered resolution, frame rate and bitrate, and the quality-kept score against your export.</li>
        </ol>
        <h2>Reading the result</h2>
        <p>
          The number that matters most is <strong>bitrate</strong>: it decides how sharp motion and fine detail look.
          Two clips can both say “1080p” and look completely different because one is served at a few Mbps and the
          other much higher. If the served resolution or frame rate is below what you exported, the platform
          downscaled you, usually because Upload HD was off or the file was out of spec.
        </p>
        <h2>If it comes back low</h2>
        <ul>
          <li>Turn on Upload HD and re-post.</li>
          <li>Start from a higher-bitrate export; compression on a weak file never recovers.</li>
          <li>
            Run it through <button type="button" className="inline-link" onClick={() => navigate('/optimize')}>Optimize</button> first, and try the test pack to find which settings survive best.
          </li>
        </ul>
      </>
    ),
  },
]
