export type AddictionCenter = {
  name: string;
  address: string;
  phone: string;
  url?: string;
};

export type AddictionCenterRegion = {
  region: string;
  centers: AddictionCenter[];
};

export const ADDICTION_CENTERS: AddictionCenterRegion[] = [
  {
    region: '서울',
    centers: [
      { name: '강북구중독관리통합지원센터', address: '서울특별시 강북구 삼양로19길 154, 2층', phone: '02-989-9223', url: 'http://gbalcohol.co.kr/' },
      { name: '노원구중독관리통합지원센터', address: '서울특별시 노원구 노원로 16길 15, 912동 1층', phone: '02-6941-3677', url: 'http://www.nowon-addiction.or.kr' },
      { name: '도봉중독관리통합지원센터', address: '서울특별시 도봉구 방학로 53 백윤빌딩 2층', phone: '02-6082-6793', url: 'http://www.dbalcohol.or.kr' },
      { name: '강남구중독관리통합지원센터', address: '강남구 선릉로 668 강남구보건소 5층', phone: '02-3443-0340' },
    ],
  },
  {
    region: '부산',
    centers: [
      { name: '부산중독관리통합지원센터', address: '부산광역시 서구 구덕로 179 융합의학연구동 2층', phone: '051-246-7570', url: 'http://www.busancamc.org' },
      { name: '사상구중독관리통합지원센터', address: '부산광역시 사상구 가야대로 196번길 51, 3층', phone: '051-988-1191', url: 'http://sasangacc.com' },
      { name: '해운대중독관리통합지원센터', address: '부산광역시 해운대구 반송로 853 반송보건지소 1층', phone: '051-545-1172', url: 'http://www.해운대중독관리통합지원센터.com' },
    ],
  },
  {
    region: '대구',
    centers: [
      { name: '달서구중독관리통합지원센터', address: '대구광역시 달서구 학산로 50 월성문화관내', phone: '053-638-3778', url: 'http://www.dcamc.or.kr' },
      { name: '대구동구중독관리통합지원센터', address: '대구광역시 동구 아양로 246-1 3층', phone: '053-957-8817', url: 'http://www.alcohol21.net' },
    ],
  },
  {
    region: '인천',
    centers: [
      { name: '계양구중독관리통합지원센터', address: '인천광역시 계양구 계양대로 126 계양구의회청사 1층', phone: '032-555-8765', url: 'http://www.goacc.or.kr' },
      { name: '남동구중독관리통합지원센터', address: '인천 남동구 간석동 169-1, 5층', phone: '032-468-6412', url: 'http://nd-jungdok.or.kr' },
      { name: '동구중독관리통합지원센터', address: '인천광역시 동구 송림로 113, 2층', phone: '032-764-1183', url: 'http://www.icdacc.org' },
      { name: '부평구중독관리통합지원센터', address: '인천광역시 부평구 마장로 410번길 5, 청천 2동 178-44', phone: '032-507-3404', url: 'http://www.bpalcohol.or.kr' },
      { name: '연수구중독관리통합지원센터', address: '인천광역시 연수구 앵고개로 183 남동부수도사업소 2층', phone: '032-236-9477', url: 'http://www.ickosacc.com' },
    ],
  },
  {
    region: '광주',
    centers: [
      { name: '광주광산구중독관리통합지원센터', address: '광주광역시 광산구 상무대로 239-1 5층', phone: '062-714-1233', url: 'http://www.gsgacc.or.kr' },
      { name: '광주남구중독관리통합지원센터', address: '광주광역시 남구 독립로 25-1', phone: '062-413-1195', url: 'http://namguacc.or.kr' },
      { name: '광주동구중독관리통합지원센터', address: '광주광역시 동구 구성로 190 흥국생명빌딩 2층', phone: '062-222-5666', url: 'http://www.dgacc.kr' },
      { name: '광주북구중독관리통합지원센터', address: '광주광역시 북구 중가로 26 4층', phone: '062-526-3370', url: 'http://www.yohanacc.or.kr' },
      { name: '광주서구중독관리통합지원센터', address: '광주광역시 서구 회재로 897-1 용현빌딩 2층', phone: '062-654-3802', url: 'http://dsracc.or.kr' },
    ],
  },
  {
    region: '대전',
    centers: [
      { name: '대전대덕구중독관리통합지원센터', address: '대전광역시 대덕구 중리서로42, 3층', phone: '042-635-8275', url: 'http://www.ddgacc.com' },
      { name: '대전동구중독관리통합지원센터', address: '대전광역시 동구 동대전로333, 3층', phone: '042-286-8275', url: 'http://www.lifeacc.or.kr/' },
      { name: '대전서구중독관리통합지원센터', address: '대전광역시 서구 갈마로 40, 3층', phone: '042-527-9125', url: 'http://www.djsaddiction.or.kr' },
      { name: '유성구중독관리통합지원센터', address: '대전광역시 유성구 노은동로 75번길 85-30, 3층', phone: '042-826-3250', url: 'http://www.yscamc.or.kr' },
      { name: '대전중구중독관리통합지원센터', address: '대전광역시 중구 계룡로 920번안길 74 종근빌딩, 2층', phone: '042-251-9730', url: 'http://www.djjgamc.or.kr' },
    ],
  },
  {
    region: '울산',
    centers: [
      { name: '울산남구중독관리통합지원센터', address: '울산광역시 남구 화합로 105, 로하스빌딩 5층', phone: '052-275-1117', url: 'http://www.usaddiction.or.kr' },
      { name: '울산중구중독관리통합지원센터', address: '울산광역시 중구 태화로 216, 3층', phone: '052-245-9007', url: 'https://blog.naver.com/ujamcenter' },
    ],
  },
  {
    region: '경기',
    centers: [
      { name: '경기광역중독관리통합지원센터', address: '경기도 수원시 장안로 262, 4층 401호', phone: '031-269-6692' },
      { name: '고양시중독관리통합지원센터', address: '경기도 고양시 일산동구 일산로 86(백석동) 1층', phone: '031-932-7071', url: 'http://www.gamc.or.kr' },
      { name: '김포시중독관리통합지원센터', address: '경기도 김포시 사우중로 108, 김포시보건소 별관2층', phone: '031-998-4005' },
      { name: '성남시중독관리통합지원센터', address: '경기도 성남시 수정로 218, 수정구보건소 5층', phone: '031-751-2768', url: 'http://www.snac.or.kr' },
      { name: '수원시중독관리통합지원센터', address: '경기도 수원시 팔달구 매산로 89 구중부소방서 2층', phone: '031-256-9478', url: 'http://www.kosacc.or.kr/' },
      { name: '안산시중독관리통합지원센터', address: '경기도 안산시 단원구 고잔동 515 구단원보건소2층', phone: '031-411-8445', url: 'http://www.ansanacc.or.kr' },
      { name: '안양시중독관리통합지원센터', address: '경기도 안양시 만안구 안양로 119 계양빌딩 7층', phone: '031-464-0175', url: 'http://www.acamc.co.kr' },
      { name: '의정부시중독관리통합지원센터', address: '경기도 의정부시 둔야로 33번길 8, 광희빌딩 5층', phone: '031-829-5001', url: 'http://www.uamc.co.kr' },
      { name: '파주시중독관리통합지원센터', address: '경기도 파주시 조리읍 봉천로 68, 2층', phone: '031-948-8004', url: 'http://www.pajuacc.com' },
      { name: '화성시중독관리통합지원센터', address: '경기도 화성시 정남면 서봉로 998 정남보건지소 1층', phone: '031-354-6614', url: 'http://www.hsalcohol.kr' },
      { name: '용인시중독관리통합지원센터', address: '용인시 처인구 모현읍 독점로 31-6', phone: '031-326-0959' },
    ],
  },
  {
    region: '강원',
    centers: [
      { name: '강원광역중독관리통합지원센터', address: '강원도 춘천시 후석로 42(석사동) 시티빌딩4층', phone: '033-251-1970', url: 'https://gwmh.or.kr:446' },
      { name: '강릉시중독관리통합지원센터', address: '강원도 강릉시 용지로 144 리치빌딩 4층', phone: '033-653-9667', url: 'http://www.gnamc.or.kr' },
      { name: '원주시중독관리통합지원센터', address: '강원도 원주시 원일로139 원주건강문화센터 지하1층', phone: '033-748-5119', url: 'http://www.alja.or.kr' },
      { name: '춘천시중독관리통합지원센터', address: '강원도 춘천시 삭주로 84 수인빌딩 3층', phone: '033-255-3482', url: 'http://www.alcoholfree.or.kr' },
    ],
  },
  {
    region: '충북',
    centers: [
      { name: '충북광역중독관리통합지원센터', address: '충북 청주시 서원구 1순환로 767 지오빌딩 2층', phone: '043-217-0597', url: 'https://www.cbmind.or.kr' },
      { name: '청주중독관리통합지원센터', address: '충북 청주시 상당구 대성로172번길 21(흥덕보건소별관) 3층', phone: '043-272-0067', url: 'http://www.cjacc.or.kr' },
    ],
  },
  {
    region: '충남',
    centers: [
      { name: '아산시중독관리통합지원센터', address: '충남 아산시 번영로216번길 18, 아산시보건소 별관 1층', phone: '041-537-3332', url: 'https://www.asan.go.kr/health/mind/index.php' },
      { name: '천안시중독관리통합지원센터', address: '충남 천안시 동남구 버들로 40, 영덕빌딩 1층', phone: '041-577-8097', url: 'http://www.cheonanac.or.kr' },
    ],
  },
  {
    region: '전북',
    centers: [
      { name: '전북광역중독관리통합지원센터', address: '전북 전주시 덕진구 정여립로 1115 나눔둥지타운 407호', phone: '063-251-0650', url: 'https://www.jbmhc.or.kr' },
      { name: '군산시중독관리통합지원센터', address: '전북 군산시 공단대로 482 4층', phone: '063-464-0061', url: 'http://www.gunsanacc.org' },
      { name: '전주시중독관리통합지원센터', address: '전북 전주시 덕진구 가리내로 10, 2층', phone: '063-223-4567', url: 'http://www.jaddiction.org/' },
      { name: '익산시중독관리통합지원센터', address: '전북 익산시 무왕로 975, 2층', phone: '063-859-7124' },
    ],
  },
  {
    region: '전남',
    centers: [
      { name: '목포시중독관리통합지원센터', address: '전남 목포시 석현로48 하당보건지소 3층', phone: '061-284-9694', url: 'http://www.jncsw.org/mamc/' },
      { name: '여수시중독관리통합지원센터', address: '전남 여수시 시청서4길 47 여수시보건소', phone: '061-659-4288', url: 'https://www.yeosu.go.kr/health' },
    ],
  },
  {
    region: '경북',
    centers: [
      { name: '구미중독관리통합지원센터', address: '경북 구미시 검성로 115-1', phone: '054-474-9791', url: 'http://gmaddiction.or.kr/' },
      { name: '포항중독관리통합지원센터', address: '경북 포항시 북구 삼흥로 98, 북구보건소 별관 2층', phone: '054-270-4191', url: 'https://www.pohang.go.kr/health/index.do' },
      { name: '안동시중독관리통합지원센터', address: '안동시 경동로 663, 2층(남부동, 남부빌딩)', phone: '054-857-7582' },
    ],
  },
  {
    region: '경남',
    centers: [
      { name: '경남광역중독관리통합지원센터', address: '경남 창원시 의창구 동읍 동읍로 457번길 48 (경남사회복지센터)', phone: '055-239-1400', url: 'https://www.gnmhc.or.kr/sub02/sub03_01.php' },
      { name: '김해중독관리통합지원센터', address: '경남 김해시 주촌면 주선로 29-1, 건강생활지원센터 1층', phone: '055-314-0317', url: 'http://www.ghacc.co.kr/' },
      { name: '마산중독관리통합지원센터', address: '경남 창원시 마산합포구 합포로 2, 3층', phone: '055-247-6994', url: 'http://www.masanacc.or.kr' },
      { name: '양산시중독관리통합지원센터', address: '경남 양산중앙로 7-32 양산시 보건복지센터 5층', phone: '055-367-9072', url: 'http://www.yscamc.org' },
      { name: '진주중독관리통합지원센터', address: '경남 진주시 진주대로 816번길 20, 2층', phone: '055-758-7801', url: 'http://www.jinjuacc.org' },
      { name: '창원중독관리통합지원센터', address: '경남 창원시 성산구 중앙대로 162번길 8, 4층', phone: '055-225-7851', url: 'http://www.cwacc.or.kr/' },
    ],
  },
  {
    region: '제주',
    centers: [
      { name: '제주광역중독관리통합지원센터', address: '제주특별자치도 제주시 아란13길15 제주대학교병원내 별관', phone: '064-717-3000', url: 'http://jejumind.or.kr' },
      { name: '서귀포중독관리통합지원센터', address: '제주특별자치도 서귀포시 중앙로 101번길 52, 서귀포보건소 2층', phone: '064-760-6552', url: 'http://www.seogwipo.go.kr/group/health/seogwipo/main.htm' },
      { name: '제주중독관리통합지원센터', address: '제주특별자치도 제주시 서사로 184 4층', phone: '064-759-0911', url: 'http://jejuaddiction.org' },
    ],
  },
];
