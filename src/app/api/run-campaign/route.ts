import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const data = await request.json();
    
    if (!data.urls || !Array.isArray(data.urls)) {
      return NextResponse.json({ error: 'Expected JSON array of URLs' }, { status: 400 });
    }
    
    // In a real scenario, this is where the campaign logic would execute.
    console.log(`[CRM Campaign API] Triggered for ${data.urls.length} URLs`);
    
    return NextResponse.json({ 
      success: true, 
      message: `Successfully processed ${data.urls.length} URLs` 
    });
    
  } catch (error: any) {
    console.error('[CRM Campaign API] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
