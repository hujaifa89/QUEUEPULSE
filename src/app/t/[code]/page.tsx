import type { Metadata } from 'next';
import { VisitorLiveClient } from './VisitorLiveClient';

export const metadata: Metadata = {
  title: 'QueuePulse – Live Queue Tracking',
  description: 'Live queue position and estimated wait time.',
  robots: {
    index: false,
    follow: false,
  },
};

interface PageProps {
  params: {
    code: string;
  };
}

export default function VisitorLivePage({ params }: PageProps) {
  return <VisitorLiveClient code={params.code} />;
}
