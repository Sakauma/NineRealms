/* Nine Realms — constraint-aware exact Sudoku engine, offline and dependency-free. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SudokuEngine = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  var FULL = 511;
  var BANK = /* BANK_START */ [
  {
    "id": "E01",
    "mode": "classic",
    "difficulty": "easy",
    "text": "530070000600195000098000060800060003400803001700020006060000280000419005000080079",
    "rating": "easy"
  },
  {
    "id": "E02",
    "mode": "classic",
    "difficulty": "easy",
    "text": "003020600900305001001806400008102900700000008006708200002609500800203009005010300",
    "rating": "easy"
  },
  {
    "id": "M03",
    "mode": "classic",
    "difficulty": "easy",
    "text": "020810740700003100090002805009040087400208003160030200302700060005600008076051090",
    "rating": "easy"
  },
  {
    "id": "E03",
    "mode": "classic",
    "difficulty": "medium",
    "text": "200080300060070084030500209000105408000000000402706000301007040720040060004010003",
    "rating": "medium"
  },
  {
    "id": "M01",
    "mode": "classic",
    "difficulty": "medium",
    "text": "000000907000420180000705026100904000050000040000507009920108000034059000507000000",
    "rating": "medium"
  },
  {
    "id": "M02",
    "mode": "classic",
    "difficulty": "medium",
    "text": "030050040008010500460000012070502080000603000040109030250000098001020600080060020",
    "rating": "medium"
  },
  {
    "id": "X03",
    "mode": "classic",
    "difficulty": "hard",
    "text": "400000805030000000000700000020000060000080400000010000000603070500200000104000000",
    "rating": "hard"
  },
  {
    "id": "H02",
    "mode": "classic",
    "difficulty": "hard",
    "text": "802000000043600000070090200050007000000045700000100030021000368008500910090000400",
    "rating": "hard"
  },
  {
    "id": "X01",
    "mode": "classic",
    "difficulty": "master",
    "text": "100007090030020008009600500005300900010080002600004000300000010040000007007000300",
    "rating": "master"
  },
  {
    "id": "X02",
    "mode": "classic",
    "difficulty": "master",
    "text": "800000000003600000070090200050007000000045700000100030001000068008500010090000400",
    "rating": "master"
  },
  {
    "id": "H03",
    "mode": "classic",
    "difficulty": "hard",
    "text": "410000805030000000000700000020000060000080400000010000000603070500200000104000000",
    "rating": "hard"
  },
  {
    "id": "D-E1",
    "mode": "diagonal",
    "difficulty": "easy",
    "text": "003900076000800540500000830184200600062100907700306000497620000015407290230500064",
    "rating": "easy"
  },
  {
    "id": "D-E2",
    "mode": "diagonal",
    "difficulty": "easy",
    "text": "004302006000700208219508000970003600468900075520406109000080002692040800040230061",
    "rating": "easy"
  },
  {
    "id": "D-E3",
    "mode": "diagonal",
    "difficulty": "easy",
    "text": "509000080070589100080000705157004830028705041906000000295803007034056210860070900",
    "rating": "easy"
  },
  {
    "id": "D-M1",
    "mode": "diagonal",
    "difficulty": "medium",
    "text": "085020040000080006100000302000036000000100035001000020060000100040000259000090460",
    "rating": "medium"
  },
  {
    "id": "D-M2",
    "mode": "diagonal",
    "difficulty": "medium",
    "text": "002800000608000700513000048000000574960000100425000000800007000100209007000000000",
    "rating": "medium"
  },
  {
    "id": "D-M3",
    "mode": "diagonal",
    "difficulty": "medium",
    "text": "008507000100000700002900001400000010000042058800600030000008140000200870080700000",
    "rating": "medium"
  },
  {
    "id": "D-H1",
    "mode": "diagonal",
    "difficulty": "hard",
    "text": "000000029000000000000040006007050000002000000009000100001000690000007500200030007",
    "rating": "hard"
  },
  {
    "id": "D-H2",
    "mode": "diagonal",
    "difficulty": "hard",
    "text": "009400010800010045500080000000000030300002000050000200000070000035000070100000900",
    "rating": "hard"
  },
  {
    "id": "D-H3",
    "mode": "diagonal",
    "difficulty": "hard",
    "text": "003000400200000000000070830080000000079400001050000004600000000000001020000524000",
    "rating": "hard"
  },
  {
    "id": "H-E1",
    "mode": "hyper",
    "difficulty": "easy",
    "text": "000860020698070001501439078000090810300080745802100060040950087003004000270610090",
    "rating": "easy"
  },
  {
    "id": "H-E2",
    "mode": "hyper",
    "difficulty": "easy",
    "text": "090001800000534000463200150010400380004063072306890410601025730000308001930000520",
    "rating": "easy"
  },
  {
    "id": "H-E3",
    "mode": "hyper",
    "difficulty": "easy",
    "text": "400091802090746351501230009840070206009080507000000400900120680304907100126050000",
    "rating": "easy"
  },
  {
    "id": "H-M1",
    "mode": "hyper",
    "difficulty": "medium",
    "text": "534020000010000000800000734000050006400000000000967040900100060200030100050002090",
    "rating": "medium"
  },
  {
    "id": "H-M2",
    "mode": "hyper",
    "difficulty": "medium",
    "text": "000310620000052000608000100000006000487000596300090700000064000704000001200000000",
    "rating": "medium"
  },
  {
    "id": "H-M3",
    "mode": "hyper",
    "difficulty": "medium",
    "text": "800070201302005900017800305000500002000000000470100000100000020053000400000000510",
    "rating": "medium"
  },
  {
    "id": "H-H1",
    "mode": "hyper",
    "difficulty": "hard",
    "text": "000000020890000000000000067000400000000000035052030000100000000000003108000007000",
    "rating": "hard"
  },
  {
    "id": "H-H2",
    "mode": "hyper",
    "difficulty": "hard",
    "text": "000000300000005100050000000008100000502604007014090600080000000030000900000000000",
    "rating": "hard"
  },
  {
    "id": "H-H3",
    "mode": "hyper",
    "difficulty": "hard",
    "text": "000000073006040090000000000640800007020000000000700400000008000000000200030090010",
    "rating": "hard"
  },
  {
    "id": "K-E1",
    "mode": "knight",
    "difficulty": "easy",
    "text": "000728604000000000634501728907086345006300007345007000000800409060450102050170060",
    "rating": "easy"
  },
  {
    "id": "K-E2",
    "mode": "knight",
    "difficulty": "easy",
    "text": "381052047050640810600000029810520070520006138470008000008000064090060380004081002",
    "rating": "easy"
  },
  {
    "id": "K-E3",
    "mode": "knight",
    "difficulty": "easy",
    "text": "000953000400102950395007080218300000040008095500000210820509746000021539003070821",
    "rating": "easy"
  },
  {
    "id": "K-M1",
    "mode": "knight",
    "difficulty": "medium",
    "text": "100903000923508000008004020000230000200700640080009000000300000000006090810000007",
    "rating": "medium"
  },
  {
    "id": "K-M2",
    "mode": "knight",
    "difficulty": "medium",
    "text": "000005000300040700501000040200071000600200071000630204000100600900000000005900408",
    "rating": "medium"
  },
  {
    "id": "K-M3",
    "mode": "knight",
    "difficulty": "medium",
    "text": "870301000300002700400700000700500020000620000600080100007105006100000000046000300",
    "rating": "medium"
  },
  {
    "id": "K-H1",
    "mode": "knight",
    "difficulty": "hard",
    "text": "000020000000000100000790036853010070000000000000070000080000200000000000300000085",
    "rating": "hard"
  },
  {
    "id": "K-H2",
    "mode": "knight",
    "difficulty": "hard",
    "text": "004000790500300000100500004000002570000030100000000006000008000000000000000000000",
    "rating": "hard"
  },
  {
    "id": "K-H3",
    "mode": "knight",
    "difficulty": "hard",
    "text": "000790000020540000000000006000000000310000070000000000400080002200000900790200005",
    "rating": "hard"
  },
  {
    "id": "B31-classic-easy-04",
    "mode": "classic",
    "difficulty": "easy",
    "text": "607938501000640020000000090000006804002805900865090013000070169304000700076100430",
    "rating": "easy"
  },
  {
    "id": "B31-classic-easy-05",
    "mode": "classic",
    "difficulty": "easy",
    "text": "001540027000700650307002001609104000020065000000007030700301805208000104016470293",
    "rating": "easy"
  },
  {
    "id": "B31-classic-easy-06",
    "mode": "classic",
    "difficulty": "easy",
    "text": "009310000316905027800000003062000008143006900500409000030072569290040001601090084",
    "rating": "easy"
  },
  {
    "id": "B31-classic-easy-07",
    "mode": "classic",
    "difficulty": "easy",
    "text": "300205609670138000000697001104000096028500000700900002016809005032050067597000408",
    "rating": "easy"
  },
  {
    "id": "B31-classic-easy-08",
    "mode": "classic",
    "difficulty": "easy",
    "text": "000201005120000600603000009870345900465100008319087500007508016580000703230009054",
    "rating": "easy"
  },
  {
    "id": "B31-classic-easy-09",
    "mode": "classic",
    "difficulty": "easy",
    "text": "800000605506307109031006784600008070408029060003060018000041250057600041080072390",
    "rating": "easy"
  },
  {
    "id": "B31-classic-easy-10",
    "mode": "classic",
    "difficulty": "easy",
    "text": "300946700600070008704105306000020600207053814805017239076004100430560000580700400",
    "rating": "easy"
  },
  {
    "id": "B31-classic-easy-11",
    "mode": "classic",
    "difficulty": "easy",
    "text": "170245903200061040009003001490050830500008100307002000000030209030020400905704300",
    "rating": "easy"
  },
  {
    "id": "B31-classic-easy-12",
    "mode": "classic",
    "difficulty": "easy",
    "text": "138060400200008900000403800013825009085640010002301600097014030000700090450200070",
    "rating": "easy"
  },
  {
    "id": "B31-classic-easy-13",
    "mode": "classic",
    "difficulty": "easy",
    "text": "300149000126805300000623007604581093000000400801032005039214000000000070068907002",
    "rating": "easy"
  },
  {
    "id": "B31-classic-easy-14",
    "mode": "classic",
    "difficulty": "easy",
    "text": "316890004072010000008703620000008000100200749760901230653020097900087060007060400",
    "rating": "easy"
  },
  {
    "id": "B31-classic-easy-15",
    "mode": "classic",
    "difficulty": "easy",
    "text": "007100030100402700032957104009200600051380029000040000000003942084590300903624051",
    "rating": "easy"
  },
  {
    "id": "B31-classic-easy-16",
    "mode": "classic",
    "difficulty": "easy",
    "text": "000700452507049001280503670316000025840060030090021846000600200600492013900000760",
    "rating": "easy"
  },
  {
    "id": "B31-classic-easy-17",
    "mode": "classic",
    "difficulty": "easy",
    "text": "172080000004002000809315274000760528580230690000000000490653010030147965605820000",
    "rating": "easy"
  },
  {
    "id": "B31-classic-easy-18",
    "mode": "classic",
    "difficulty": "easy",
    "text": "069320800308670000020058069500936104000200500030004020600090750000842000010060098",
    "rating": "easy"
  },
  {
    "id": "B31-classic-easy-19",
    "mode": "classic",
    "difficulty": "easy",
    "text": "000900000007840100634000000000398752752004090080070401020053006001009240065400937",
    "rating": "easy"
  },
  {
    "id": "B31-classic-easy-20",
    "mode": "classic",
    "difficulty": "easy",
    "text": "950281030031000205000005790000020109810750600070000520000078000694310807700064310",
    "rating": "easy"
  },
  {
    "id": "B31-classic-medium-04",
    "mode": "classic",
    "difficulty": "medium",
    "text": "208010000060000000903700000000000009005026000009000005000280600700500410010009503",
    "rating": "medium"
  },
  {
    "id": "B31-classic-medium-05",
    "mode": "classic",
    "difficulty": "medium",
    "text": "700502009600008241000000000000001000080900005300000008000400007200009800094003510",
    "rating": "medium"
  },
  {
    "id": "B31-classic-medium-06",
    "mode": "classic",
    "difficulty": "medium",
    "text": "002004003107050298000019050800000079500000000000000620080300000000007015009000300",
    "rating": "medium"
  },
  {
    "id": "B31-classic-medium-07",
    "mode": "classic",
    "difficulty": "medium",
    "text": "024000750090000300000300080200003006170000200000500070600100009000005813008002000",
    "rating": "medium"
  },
  {
    "id": "B31-classic-medium-08",
    "mode": "classic",
    "difficulty": "medium",
    "text": "000710000000048100900005080000020000091300060400006020000080053005000600603000010",
    "rating": "medium"
  },
  {
    "id": "B31-classic-medium-09",
    "mode": "classic",
    "difficulty": "medium",
    "text": "000000002050000700402010030908600007200054000300000000010030050000090400090701200",
    "rating": "medium"
  },
  {
    "id": "B31-classic-medium-10",
    "mode": "classic",
    "difficulty": "medium",
    "text": "250060000091700005070000304004020000000000940000080500006000100300100006700052000",
    "rating": "medium"
  },
  {
    "id": "B31-classic-medium-11",
    "mode": "classic",
    "difficulty": "medium",
    "text": "200060000090000000576000012009000078000100000003094500000020001400701980000000007",
    "rating": "medium"
  },
  {
    "id": "B31-classic-medium-12",
    "mode": "classic",
    "difficulty": "medium",
    "text": "700000060040000000001270000000000250024080070305000491050104006900000100003067500",
    "rating": "medium"
  },
  {
    "id": "B31-classic-medium-13",
    "mode": "classic",
    "difficulty": "medium",
    "text": "000810000100002370030500000050000002000004080078000000804100095006400200000000038",
    "rating": "medium"
  },
  {
    "id": "B31-classic-medium-14",
    "mode": "classic",
    "difficulty": "medium",
    "text": "000002309970030600650001007200500000009006000001800000090003000000000410040070003",
    "rating": "medium"
  },
  {
    "id": "B31-classic-medium-15",
    "mode": "classic",
    "difficulty": "medium",
    "text": "200670904008200000000080002060000000000008007302050040000000060405100003086042070",
    "rating": "medium"
  },
  {
    "id": "B31-classic-medium-16",
    "mode": "classic",
    "difficulty": "medium",
    "text": "650000940730000080400020600000810490090060150000009003100000500000700000020601000",
    "rating": "medium"
  },
  {
    "id": "B31-classic-medium-17",
    "mode": "classic",
    "difficulty": "medium",
    "text": "007000035000030402009600001006090000010000040400000270100004000000700063900300010",
    "rating": "medium"
  },
  {
    "id": "B31-classic-medium-18",
    "mode": "classic",
    "difficulty": "medium",
    "text": "080000300001040000000928000000000000000509023807003009900100850002000000140730000",
    "rating": "medium"
  },
  {
    "id": "B31-classic-medium-19",
    "mode": "classic",
    "difficulty": "medium",
    "text": "700900030000000780501000040000406900000080001006070000000004500090150300480000006",
    "rating": "medium"
  },
  {
    "id": "B31-classic-medium-20",
    "mode": "classic",
    "difficulty": "medium",
    "text": "031050002000000300000097800570006008840030200000000006003064000000200000005009700",
    "rating": "medium"
  },
  {
    "id": "B31-classic-hard-04",
    "mode": "classic",
    "difficulty": "hard",
    "text": "001000000003000040040080750000040000600075032020600100002008000080504003700100000",
    "rating": "hard"
  },
  {
    "id": "B31-classic-hard-05",
    "mode": "classic",
    "difficulty": "hard",
    "text": "012007000000000000680543000000000086040002000260700003000900000000850701500000820",
    "rating": "hard"
  },
  {
    "id": "B31-classic-hard-06",
    "mode": "classic",
    "difficulty": "hard",
    "text": "000057000008000750004600020025004001010000000800000000000302870300800090900470030",
    "rating": "hard"
  },
  {
    "id": "B31-classic-hard-07",
    "mode": "classic",
    "difficulty": "hard",
    "text": "000050060007060005500000309006400001002008000800600000050140026904030000000000000",
    "rating": "hard"
  },
  {
    "id": "B31-classic-hard-08",
    "mode": "classic",
    "difficulty": "hard",
    "text": "032007000080600093000000610000000040800340100500060000405006080000003200001900000",
    "rating": "hard"
  },
  {
    "id": "B31-classic-hard-09",
    "mode": "classic",
    "difficulty": "hard",
    "text": "000015000000060040700490061100006027000000950907000100002030795004000080070002000",
    "rating": "hard"
  },
  {
    "id": "B31-classic-hard-10",
    "mode": "classic",
    "difficulty": "hard",
    "text": "050100080080420060000000097004000900920000000000306000000030000000500674000080500",
    "rating": "hard"
  },
  {
    "id": "B31-classic-hard-11",
    "mode": "classic",
    "difficulty": "hard",
    "text": "070420000063008090000600007007000502400006010852040000000000000028000004000000956",
    "rating": "hard"
  },
  {
    "id": "B31-classic-hard-12",
    "mode": "classic",
    "difficulty": "hard",
    "text": "502040009000005700000090060040000007000106005007000090000000806154600030000003000",
    "rating": "hard"
  },
  {
    "id": "B31-classic-hard-13",
    "mode": "classic",
    "difficulty": "hard",
    "text": "000060000200003007600850003905007000030000090100000600300201006400000800008006001",
    "rating": "hard"
  },
  {
    "id": "B31-classic-hard-14",
    "mode": "classic",
    "difficulty": "hard",
    "text": "300009804000700000200080950090024000060070000080000300500000006007060000000901500",
    "rating": "hard"
  },
  {
    "id": "B31-classic-hard-15",
    "mode": "classic",
    "difficulty": "hard",
    "text": "000070050800000400400000681700024100600085000000100090000000200008350004070001000",
    "rating": "hard"
  },
  {
    "id": "B31-classic-hard-16",
    "mode": "classic",
    "difficulty": "hard",
    "text": "050000006000302090400700008002000050040005009000020014060049030000680000000003085",
    "rating": "hard"
  },
  {
    "id": "B31-classic-hard-17",
    "mode": "classic",
    "difficulty": "hard",
    "text": "000050002004020060060010040009002001100760000030005007000000003003906000057080900",
    "rating": "hard"
  },
  {
    "id": "B31-classic-hard-18",
    "mode": "classic",
    "difficulty": "hard",
    "text": "000000912010000370007000000600000000000304000040501806900780000060020050700003060",
    "rating": "hard"
  },
  {
    "id": "B31-classic-hard-19",
    "mode": "classic",
    "difficulty": "hard",
    "text": "090000000007000200000010050040065010206004900000200000860000000009003805003050061",
    "rating": "hard"
  },
  {
    "id": "B31-classic-hard-20",
    "mode": "classic",
    "difficulty": "hard",
    "text": "003400000700000000620005004308000000009006310000080050000004900000030200257100400",
    "rating": "hard"
  },
  {
    "id": "B31-classic-master-03",
    "mode": "classic",
    "difficulty": "master",
    "text": "006700000007002450000080060004000709020000604000140002040023000900000001050008000",
    "rating": "master"
  },
  {
    "id": "B31-classic-master-04",
    "mode": "classic",
    "difficulty": "master",
    "text": "090000000003005960040020000060050100809030070000810030000740001000006050007000003",
    "rating": "master"
  },
  {
    "id": "B31-classic-master-05",
    "mode": "classic",
    "difficulty": "master",
    "text": "970000080000000504010000300000300000002950130600002000100030600000026093700000000",
    "rating": "master"
  },
  {
    "id": "B31-classic-master-06",
    "mode": "classic",
    "difficulty": "master",
    "text": "000280049000000000920034000000090130300050000060000700080000092000603007670020050",
    "rating": "master"
  },
  {
    "id": "B31-classic-master-07",
    "mode": "classic",
    "difficulty": "master",
    "text": "040100600200009003107000005000000800720091000090000006500020000000005900000308407",
    "rating": "master"
  },
  {
    "id": "B31-classic-master-08",
    "mode": "classic",
    "difficulty": "master",
    "text": "070000402010000037960700000002005008000900000400006200007200801000800050100000004",
    "rating": "master"
  },
  {
    "id": "B31-classic-master-09",
    "mode": "classic",
    "difficulty": "master",
    "text": "000001009070000008500403100000206700006000000020509601003004005040000087100000900",
    "rating": "master"
  },
  {
    "id": "B31-classic-master-10",
    "mode": "classic",
    "difficulty": "master",
    "text": "007900200800006400030050100040210600023090000000700000080600020000087040000000500",
    "rating": "master"
  },
  {
    "id": "B31-diagonal-easy-04",
    "mode": "diagonal",
    "difficulty": "easy",
    "text": "020001000038005100100000035080270014003000820600048079307004050851600043049003007",
    "rating": "easy"
  },
  {
    "id": "B31-diagonal-easy-05",
    "mode": "diagonal",
    "difficulty": "easy",
    "text": "000010070080200056307658040094006010006020095070030602060040007018702039050301800",
    "rating": "easy"
  },
  {
    "id": "B31-diagonal-easy-06",
    "mode": "diagonal",
    "difficulty": "easy",
    "text": "600008000000623471107054836400070203900030010300092000006040108891000040054080309",
    "rating": "easy"
  },
  {
    "id": "B31-diagonal-easy-07",
    "mode": "diagonal",
    "difficulty": "easy",
    "text": "001205046040700008030400712073000051160900074052070309024607090605300020007020400",
    "rating": "easy"
  },
  {
    "id": "B31-diagonal-easy-08",
    "mode": "diagonal",
    "difficulty": "easy",
    "text": "106008000570326019930105060002510380003009500010840000069001008047600103300904602",
    "rating": "easy"
  },
  {
    "id": "B31-diagonal-easy-09",
    "mode": "diagonal",
    "difficulty": "easy",
    "text": "098503201710040300020681590200010003030000908800905010563198720070462000000300160",
    "rating": "easy"
  },
  {
    "id": "B31-diagonal-easy-10",
    "mode": "diagonal",
    "difficulty": "easy",
    "text": "480001037000386100031050800098005300513800020607000980800034071005678403004912600",
    "rating": "easy"
  },
  {
    "id": "B31-diagonal-easy-11",
    "mode": "diagonal",
    "difficulty": "easy",
    "text": "700000948150020030800076001962057304000090006500000719001042000005789003009001002",
    "rating": "easy"
  },
  {
    "id": "B31-diagonal-easy-12",
    "mode": "diagonal",
    "difficulty": "easy",
    "text": "053106800791032000600000001800007023026913700000008615038200069000500034940060000",
    "rating": "easy"
  },
  {
    "id": "B31-diagonal-easy-13",
    "mode": "diagonal",
    "difficulty": "easy",
    "text": "080367090973004100060905003030809010000000054750100038027491086640070000000020740",
    "rating": "easy"
  },
  {
    "id": "B31-diagonal-easy-14",
    "mode": "diagonal",
    "difficulty": "easy",
    "text": "605920784809007600000065300702000461300100257100600090041080530200003046000000178",
    "rating": "easy"
  },
  {
    "id": "B31-diagonal-easy-15",
    "mode": "diagonal",
    "difficulty": "easy",
    "text": "138090650002000003040603890000305908060100235573000104950038417000000089384009000",
    "rating": "easy"
  },
  {
    "id": "B31-diagonal-easy-16",
    "mode": "diagonal",
    "difficulty": "easy",
    "text": "000740509000653240240008037564800903090020701000300400001086002902001806036275100",
    "rating": "easy"
  },
  {
    "id": "B31-diagonal-easy-17",
    "mode": "diagonal",
    "difficulty": "easy",
    "text": "000100709009040206210090850100604000000301960026580371547900100032417600081035007",
    "rating": "easy"
  },
  {
    "id": "B31-diagonal-easy-18",
    "mode": "diagonal",
    "difficulty": "easy",
    "text": "300520070000300050275040060009400080050963400020000390560718200902630010700200600",
    "rating": "easy"
  },
  {
    "id": "B31-diagonal-easy-19",
    "mode": "diagonal",
    "difficulty": "easy",
    "text": "300007461600021097701600208000090012900580600265004700820060070100005000000078046",
    "rating": "easy"
  },
  {
    "id": "B31-diagonal-easy-20",
    "mode": "diagonal",
    "difficulty": "easy",
    "text": "640980000003006594007004006930400850208650307050023019071002900300000420000068001",
    "rating": "easy"
  },
  {
    "id": "B31-diagonal-medium-04",
    "mode": "diagonal",
    "difficulty": "medium",
    "text": "020090056500000090008507000030005640004030900106000000001050020080010000700000000",
    "rating": "medium"
  },
  {
    "id": "B31-diagonal-medium-05",
    "mode": "diagonal",
    "difficulty": "medium",
    "text": "000000000030000100020900004070000001000028075000010030790360020000090007850100006",
    "rating": "medium"
  },
  {
    "id": "B31-diagonal-medium-06",
    "mode": "diagonal",
    "difficulty": "medium",
    "text": "009072500000000068000000207000020030100300000060401000607004000012800000930007000",
    "rating": "medium"
  },
  {
    "id": "B31-diagonal-medium-07",
    "mode": "diagonal",
    "difficulty": "medium",
    "text": "200600000009200001000900002000000090900500307800700206080009130000003074000006000",
    "rating": "medium"
  },
  {
    "id": "B31-diagonal-medium-08",
    "mode": "diagonal",
    "difficulty": "medium",
    "text": "001040050000000200937020006002085071000000000050000900000002800005834000400000030",
    "rating": "medium"
  },
  {
    "id": "B31-diagonal-medium-09",
    "mode": "diagonal",
    "difficulty": "medium",
    "text": "007300640610000009000000700020004087001500090080000060040000008008430901000000000",
    "rating": "medium"
  },
  {
    "id": "B31-diagonal-medium-10",
    "mode": "diagonal",
    "difficulty": "medium",
    "text": "042700900000006000000004050001048060400000809200100000029000005600400700500000008",
    "rating": "medium"
  },
  {
    "id": "B31-diagonal-medium-11",
    "mode": "diagonal",
    "difficulty": "medium",
    "text": "300006590009520000000000020580000000900100068040000000000000106000000084800040932",
    "rating": "medium"
  },
  {
    "id": "B31-diagonal-medium-12",
    "mode": "diagonal",
    "difficulty": "medium",
    "text": "001000000700004000000706093000000941640930082000002030000070050000009010080003000",
    "rating": "medium"
  },
  {
    "id": "B31-diagonal-medium-13",
    "mode": "diagonal",
    "difficulty": "medium",
    "text": "000000300100870000400001095000000009000090152900058000004300000650010040002400000",
    "rating": "medium"
  },
  {
    "id": "B31-diagonal-medium-14",
    "mode": "diagonal",
    "difficulty": "medium",
    "text": "000930000000400000001002509000200400000000290700100350070000000196020000408000760",
    "rating": "medium"
  },
  {
    "id": "B31-diagonal-medium-15",
    "mode": "diagonal",
    "difficulty": "medium",
    "text": "204000003530007840000200070097402000080000000000700030028000506000020000040090000",
    "rating": "medium"
  },
  {
    "id": "B31-diagonal-medium-16",
    "mode": "diagonal",
    "difficulty": "medium",
    "text": "100000000703000006040009800908006030000801060000004100520400008000007000000600013",
    "rating": "medium"
  },
  {
    "id": "B31-diagonal-medium-17",
    "mode": "diagonal",
    "difficulty": "medium",
    "text": "000970000010080600204000800090003000806000050100000090900030500003010026500700000",
    "rating": "medium"
  },
  {
    "id": "B31-diagonal-medium-18",
    "mode": "diagonal",
    "difficulty": "medium",
    "text": "000014000700008000100030005500000600046200709007450000080300070000000010609000800",
    "rating": "medium"
  },
  {
    "id": "B31-diagonal-medium-19",
    "mode": "diagonal",
    "difficulty": "medium",
    "text": "000200006000049000000003000058000670900070000002050800000630940040000000090024160",
    "rating": "medium"
  },
  {
    "id": "B31-diagonal-medium-20",
    "mode": "diagonal",
    "difficulty": "medium",
    "text": "308070400250000070000008906400000000000000000080007200010020090742059000000006002",
    "rating": "medium"
  },
  {
    "id": "B31-diagonal-hard-04",
    "mode": "diagonal",
    "difficulty": "hard",
    "text": "000000000000000013010700804040000605809000030036000008000000001007008000000164020",
    "rating": "hard"
  },
  {
    "id": "B31-diagonal-hard-05",
    "mode": "diagonal",
    "difficulty": "hard",
    "text": "020006000050000000007000354000601000076540000005008002030709000000000000000000000",
    "rating": "hard"
  },
  {
    "id": "B31-diagonal-hard-06",
    "mode": "diagonal",
    "difficulty": "hard",
    "text": "000070405600000000140000900030000000000009600907000030090062010000007000000000000",
    "rating": "hard"
  },
  {
    "id": "B31-diagonal-hard-07",
    "mode": "diagonal",
    "difficulty": "hard",
    "text": "010900050000007008000500400000000000008700000007100000000000030050003260000492000",
    "rating": "hard"
  },
  {
    "id": "B31-diagonal-hard-08",
    "mode": "diagonal",
    "difficulty": "hard",
    "text": "070600048000000000900087000000000200000106000090230106040870600000400002000000000",
    "rating": "hard"
  },
  {
    "id": "B31-diagonal-hard-09",
    "mode": "diagonal",
    "difficulty": "hard",
    "text": "027900060000300070000004025000040008001000000700080000900400006004003000000000010",
    "rating": "hard"
  },
  {
    "id": "B31-diagonal-hard-10",
    "mode": "diagonal",
    "difficulty": "hard",
    "text": "000009003000006005042000001070000006030094000800000000400007000000000510000910000",
    "rating": "hard"
  },
  {
    "id": "B31-diagonal-hard-11",
    "mode": "diagonal",
    "difficulty": "hard",
    "text": "000000000001040000600100000090006017004009060008000025070400000010000500080020090",
    "rating": "hard"
  },
  {
    "id": "B31-diagonal-hard-12",
    "mode": "diagonal",
    "difficulty": "hard",
    "text": "007000000500004309000000001000000040000200000002006008006000002090000070030091000",
    "rating": "hard"
  },
  {
    "id": "B31-diagonal-hard-13",
    "mode": "diagonal",
    "difficulty": "hard",
    "text": "005000090702000006600000004001000020200000003000009010050000601000000800003600000",
    "rating": "hard"
  },
  {
    "id": "B31-diagonal-hard-14",
    "mode": "diagonal",
    "difficulty": "hard",
    "text": "000000000040090300000000408009007600087200000002005080600050000000020030000060000",
    "rating": "hard"
  },
  {
    "id": "B31-diagonal-hard-15",
    "mode": "diagonal",
    "difficulty": "hard",
    "text": "006000000000000020002000004005100036000004080000030400060000810500000070900800000",
    "rating": "hard"
  },
  {
    "id": "B31-diagonal-hard-16",
    "mode": "diagonal",
    "difficulty": "hard",
    "text": "090000000000080000080009000000500840000000510600000000003000150040030000800102600",
    "rating": "hard"
  },
  {
    "id": "B31-diagonal-hard-17",
    "mode": "diagonal",
    "difficulty": "hard",
    "text": "000050100200076000000003004340000000000900000050010090004000020005002000000000001",
    "rating": "hard"
  },
  {
    "id": "B31-diagonal-hard-18",
    "mode": "diagonal",
    "difficulty": "hard",
    "text": "000004700030005080001790000000071306600000020000009000000000000900000200000003000",
    "rating": "hard"
  },
  {
    "id": "B31-diagonal-hard-19",
    "mode": "diagonal",
    "difficulty": "hard",
    "text": "000000000000700001090426000600000045000000210000000008050900000040000860900108500",
    "rating": "hard"
  },
  {
    "id": "B31-diagonal-hard-20",
    "mode": "diagonal",
    "difficulty": "hard",
    "text": "000007002000059000060103000900000000000000009700400000800000350001070000005600000",
    "rating": "hard"
  },
  {
    "id": "B31-hyper-easy-04",
    "mode": "hyper",
    "difficulty": "easy",
    "text": "809070006104000908060940020018730009305006702006002000002401307000307604407050000",
    "rating": "easy"
  },
  {
    "id": "B31-hyper-easy-05",
    "mode": "hyper",
    "difficulty": "easy",
    "text": "200068015500000200061290078009020807300070000000514903002900000040183502010640730",
    "rating": "easy"
  },
  {
    "id": "B31-hyper-easy-06",
    "mode": "hyper",
    "difficulty": "easy",
    "text": "050700398743080600000000004500200486000060275000405130860310900410000060390840017",
    "rating": "easy"
  },
  {
    "id": "B31-hyper-easy-07",
    "mode": "hyper",
    "difficulty": "easy",
    "text": "105407000086000070400000035054309002000800560968020347542710003030940000090653100",
    "rating": "easy"
  },
  {
    "id": "B31-hyper-easy-08",
    "mode": "hyper",
    "difficulty": "easy",
    "text": "000100059500089000700504806200796504070800693906403000007900000100008947609207385",
    "rating": "easy"
  },
  {
    "id": "B31-hyper-easy-09",
    "mode": "hyper",
    "difficulty": "easy",
    "text": "092300601503074200600291500050900304900030700060807159020069430109000005470503900",
    "rating": "easy"
  },
  {
    "id": "B31-hyper-easy-10",
    "mode": "hyper",
    "difficulty": "easy",
    "text": "300026587006508300520300016079402001405600008160705004240070060951004720000200140",
    "rating": "easy"
  },
  {
    "id": "B31-hyper-easy-11",
    "mode": "hyper",
    "difficulty": "easy",
    "text": "108074920600012004000600017015807640000006503000245000053400000000700460460001730",
    "rating": "easy"
  },
  {
    "id": "B31-hyper-easy-12",
    "mode": "hyper",
    "difficulty": "easy",
    "text": "168400025500602800403000007900860002207090006085030109000350001090706054000900760",
    "rating": "easy"
  },
  {
    "id": "B31-hyper-easy-13",
    "mode": "hyper",
    "difficulty": "easy",
    "text": "030000000875010904264890017012037046007100003008640070000000050050003080480021739",
    "rating": "easy"
  },
  {
    "id": "B31-hyper-easy-14",
    "mode": "hyper",
    "difficulty": "easy",
    "text": "812040030057100429060327001020000007703009160600002000080073900935208000070590203",
    "rating": "easy"
  },
  {
    "id": "B31-hyper-easy-15",
    "mode": "hyper",
    "difficulty": "easy",
    "text": "390001504480000397000094001609200008230180706000400930020900005900612403060750820",
    "rating": "easy"
  },
  {
    "id": "B31-hyper-easy-16",
    "mode": "hyper",
    "difficulty": "easy",
    "text": "710046000495003060200090143630050070174960300000300406021079080000821609980030002",
    "rating": "easy"
  },
  {
    "id": "B31-hyper-easy-17",
    "mode": "hyper",
    "difficulty": "easy",
    "text": "038000049900304001000982350206037904000529680080010070060100000005740196194065708",
    "rating": "easy"
  },
  {
    "id": "B31-hyper-easy-18",
    "mode": "hyper",
    "difficulty": "easy",
    "text": "489070001716345080050001000004003625800560400000090170290100060008450000000026800",
    "rating": "easy"
  },
  {
    "id": "B31-hyper-easy-19",
    "mode": "hyper",
    "difficulty": "easy",
    "text": "300540079060200080400701360603090701100000298052070040800917026500020910200000000",
    "rating": "easy"
  },
  {
    "id": "B31-hyper-easy-20",
    "mode": "hyper",
    "difficulty": "easy",
    "text": "080004700000090105293175600000237491004009008120068500010056040006080017702040000",
    "rating": "easy"
  },
  {
    "id": "B31-hyper-medium-04",
    "mode": "hyper",
    "difficulty": "medium",
    "text": "098000001020060300000000029006000400000020900000000030800000702002096050001203060",
    "rating": "medium"
  },
  {
    "id": "B31-hyper-medium-05",
    "mode": "hyper",
    "difficulty": "medium",
    "text": "001400007405000000000090430002060005000020000980704310700000800004007900060000000",
    "rating": "medium"
  },
  {
    "id": "B31-hyper-medium-06",
    "mode": "hyper",
    "difficulty": "medium",
    "text": "010780000003000000000503000026040000000097142070000980000000000759000430030000200",
    "rating": "medium"
  },
  {
    "id": "B31-hyper-medium-07",
    "mode": "hyper",
    "difficulty": "medium",
    "text": "000500092200030700008000030400006209900000001002900000001020000003000820800050600",
    "rating": "medium"
  },
  {
    "id": "B31-hyper-medium-08",
    "mode": "hyper",
    "difficulty": "medium",
    "text": "000090000900074200007050090002067010800000407705000000400315000001708000000000000",
    "rating": "medium"
  },
  {
    "id": "B31-hyper-medium-09",
    "mode": "hyper",
    "difficulty": "medium",
    "text": "000107000000000000480300100002406003007200010008010000830000570000000030604800001",
    "rating": "medium"
  },
  {
    "id": "B31-hyper-medium-10",
    "mode": "hyper",
    "difficulty": "medium",
    "text": "000000025029703000100000803081000060000000000064090000007000000038070004040100350",
    "rating": "medium"
  },
  {
    "id": "B31-hyper-medium-11",
    "mode": "hyper",
    "difficulty": "medium",
    "text": "000903000005002000000060802309050000800630004050000090000070500007400000640500080",
    "rating": "medium"
  },
  {
    "id": "B31-hyper-medium-12",
    "mode": "hyper",
    "difficulty": "medium",
    "text": "100000090000060020389004000040610005610700800000000000000045970000000000094000560",
    "rating": "medium"
  },
  {
    "id": "B31-hyper-medium-13",
    "mode": "hyper",
    "difficulty": "medium",
    "text": "030400000000000030000830907010080050005700010006020009090000070050279160000000000",
    "rating": "medium"
  },
  {
    "id": "B31-hyper-medium-14",
    "mode": "hyper",
    "difficulty": "medium",
    "text": "002000001600000085010270040000000000903001000000300579004000000050900107008100050",
    "rating": "medium"
  },
  {
    "id": "B31-hyper-medium-15",
    "mode": "hyper",
    "difficulty": "medium",
    "text": "078000023000000007003000600000000000000600010310070065906000100180300000030009502",
    "rating": "medium"
  },
  {
    "id": "B31-hyper-medium-16",
    "mode": "hyper",
    "difficulty": "medium",
    "text": "004500002003000000000000900490600000000900834000004097500840000007000009821000700",
    "rating": "medium"
  },
  {
    "id": "B31-hyper-medium-17",
    "mode": "hyper",
    "difficulty": "medium",
    "text": "050006380000000004100003000020005040008004070000000610001730400000259000030000090",
    "rating": "medium"
  },
  {
    "id": "B31-hyper-medium-18",
    "mode": "hyper",
    "difficulty": "medium",
    "text": "030000000000300000590800004307560008020000003850000720900000005001000000005940300",
    "rating": "medium"
  },
  {
    "id": "B31-hyper-medium-19",
    "mode": "hyper",
    "difficulty": "medium",
    "text": "420050600000200050090064000000000000007409002109080060010000070708300900600000000",
    "rating": "medium"
  },
  {
    "id": "B31-hyper-medium-20",
    "mode": "hyper",
    "difficulty": "medium",
    "text": "830009000705602000000000080008000500090007800060940000000100050000824907000000300",
    "rating": "medium"
  },
  {
    "id": "B31-hyper-hard-04",
    "mode": "hyper",
    "difficulty": "hard",
    "text": "300009000001400600000000000005600700090000004000005300004970800000000000000000000",
    "rating": "hard"
  },
  {
    "id": "B31-hyper-hard-05",
    "mode": "hyper",
    "difficulty": "hard",
    "text": "800000000001000000000000506000400030030010700000030001005090018000020000090000650",
    "rating": "hard"
  },
  {
    "id": "B31-hyper-hard-06",
    "mode": "hyper",
    "difficulty": "hard",
    "text": "400000010600005000000000000003007002000080090001500000000000000004030800078900000",
    "rating": "hard"
  },
  {
    "id": "B31-hyper-hard-07",
    "mode": "hyper",
    "difficulty": "hard",
    "text": "000080700000000000001500000000000000050230040008400059000000007600000000200000300",
    "rating": "hard"
  },
  {
    "id": "B31-hyper-hard-08",
    "mode": "hyper",
    "difficulty": "hard",
    "text": "003000000000000000205001000002000090090600000010000004020000100000027430000030070",
    "rating": "hard"
  },
  {
    "id": "B31-hyper-hard-09",
    "mode": "hyper",
    "difficulty": "hard",
    "text": "800000000700000040010040690000600200000000105000000000008070500000520000000000060",
    "rating": "hard"
  },
  {
    "id": "B31-hyper-hard-10",
    "mode": "hyper",
    "difficulty": "hard",
    "text": "206800300000010000700000005000700000000001006150000000800062000000000049000000200",
    "rating": "hard"
  },
  {
    "id": "B31-hyper-hard-11",
    "mode": "hyper",
    "difficulty": "hard",
    "text": "035000008008000000000008000000000040000060000200030070000600000890000001020059000",
    "rating": "hard"
  },
  {
    "id": "B31-hyper-hard-12",
    "mode": "hyper",
    "difficulty": "hard",
    "text": "006000000270040001080000506000000000502080690000001000000000040000000007000900000",
    "rating": "hard"
  },
  {
    "id": "B31-hyper-hard-13",
    "mode": "hyper",
    "difficulty": "hard",
    "text": "700200000200000003060700000100500000000300708000000100001800000302006090000000000",
    "rating": "hard"
  },
  {
    "id": "B31-hyper-hard-14",
    "mode": "hyper",
    "difficulty": "hard",
    "text": "000209005300000000004705000000000100070090000450000300006070000000000080000000002",
    "rating": "hard"
  },
  {
    "id": "B31-hyper-hard-15",
    "mode": "hyper",
    "difficulty": "hard",
    "text": "000000000600000037190000000500002000000000060070000080900080000006400000400100000",
    "rating": "hard"
  },
  {
    "id": "B31-hyper-hard-16",
    "mode": "hyper",
    "difficulty": "hard",
    "text": "000000500000080007000065000500000400000800060000070005000040008600900700003000020",
    "rating": "hard"
  },
  {
    "id": "B31-hyper-hard-17",
    "mode": "hyper",
    "difficulty": "hard",
    "text": "000080000409000000020000400000000000500600000002007090007000018004000000050003000",
    "rating": "hard"
  },
  {
    "id": "B31-hyper-hard-18",
    "mode": "hyper",
    "difficulty": "hard",
    "text": "000000200000200070000876090000000000000500003050000000010700350000000048006000000",
    "rating": "hard"
  },
  {
    "id": "B31-hyper-hard-19",
    "mode": "hyper",
    "difficulty": "hard",
    "text": "090006140030080200000000900000000000400017000000000001000600000000300075070000002",
    "rating": "hard"
  },
  {
    "id": "B31-hyper-hard-20",
    "mode": "hyper",
    "difficulty": "hard",
    "text": "100000000400000000000300059000060000009000000007000006005010000010600700800090004",
    "rating": "hard"
  },
  {
    "id": "B31-knight-easy-04",
    "mode": "knight",
    "difficulty": "easy",
    "text": "000001000080600002600052800700810096810400520090500108500008064100900000964205381",
    "rating": "easy"
  },
  {
    "id": "B31-knight-easy-05",
    "mode": "knight",
    "difficulty": "easy",
    "text": "005000814014000007300010965490032000781406530500701006100000270070000003053008109",
    "rating": "easy"
  },
  {
    "id": "B31-knight-easy-06",
    "mode": "knight",
    "difficulty": "easy",
    "text": "801230005000091230020000890089700064406189020302000009010000050005910070230045910",
    "rating": "easy"
  },
  {
    "id": "B31-knight-easy-07",
    "mode": "knight",
    "difficulty": "easy",
    "text": "630024000001609020000001000063400581108960402240158060300047100800090240000015390",
    "rating": "easy"
  },
  {
    "id": "B31-knight-easy-08",
    "mode": "knight",
    "difficulty": "easy",
    "text": "720500396030720508850600720100850009003000000080060100217085000390210405008006217",
    "rating": "easy"
  },
  {
    "id": "B31-knight-easy-09",
    "mode": "knight",
    "difficulty": "easy",
    "text": "000082007982400030400001000031829604820600300674315298005090046200006100040050902",
    "rating": "easy"
  },
  {
    "id": "B31-knight-easy-10",
    "mode": "knight",
    "difficulty": "easy",
    "text": "000000420068400073429100685170605290685200001090700856000806942806940300902000000",
    "rating": "easy"
  },
  {
    "id": "B31-knight-easy-11",
    "mode": "knight",
    "difficulty": "easy",
    "text": "010059704470000850005472000001980072240601005090200030163008200000103090009000100",
    "rating": "easy"
  },
  {
    "id": "B31-knight-easy-12",
    "mode": "knight",
    "difficulty": "easy",
    "text": "400008069000760050769304080304080000080690500007003802503802006812070005970030000",
    "rating": "easy"
  },
  {
    "id": "B31-knight-easy-13",
    "mode": "knight",
    "difficulty": "easy",
    "text": "860315002000472600472690003090003000103704086024080000900030200031240060240009000",
    "rating": "easy"
  },
  {
    "id": "B31-knight-easy-14",
    "mode": "knight",
    "difficulty": "easy",
    "text": "203705410001083000500641200020009001064020509000004000032900064416032057000406032",
    "rating": "easy"
  },
  {
    "id": "B31-knight-easy-15",
    "mode": "knight",
    "difficulty": "easy",
    "text": "400509000039107684100680395004095071090201040200806900040950700003002060702000509",
    "rating": "easy"
  },
  {
    "id": "B31-knight-easy-16",
    "mode": "knight",
    "difficulty": "easy",
    "text": "320070960105004200900203700083701640001000800600800507002017490517400028096328000",
    "rating": "easy"
  },
  {
    "id": "B31-knight-easy-17",
    "mode": "knight",
    "difficulty": "easy",
    "text": "100963580008074960006008004407306208825017006039800407040039025500701009900000700",
    "rating": "easy"
  },
  {
    "id": "B31-knight-easy-18",
    "mode": "knight",
    "difficulty": "easy",
    "text": "700080200500213000200040086000062007802030405100095002900020374001370058074008000",
    "rating": "easy"
  },
  {
    "id": "B31-knight-easy-19",
    "mode": "knight",
    "difficulty": "easy",
    "text": "020015080010080924080004305240100009050069000009043100000508092078600400002031078",
    "rating": "easy"
  },
  {
    "id": "B31-knight-easy-20",
    "mode": "knight",
    "difficulty": "easy",
    "text": "092008100030490008500130000649057000013609207007003009000900080701364900925700004",
    "rating": "easy"
  },
  {
    "id": "B31-knight-medium-04",
    "mode": "knight",
    "difficulty": "medium",
    "text": "000000000258600040003000000009000030000030407000090005090005300800060000361004058",
    "rating": "medium"
  },
  {
    "id": "B31-knight-medium-05",
    "mode": "knight",
    "difficulty": "medium",
    "text": "306000000000300000000700320800090004070002000005000800080060507000400260209010400",
    "rating": "medium"
  },
  {
    "id": "B31-knight-medium-06",
    "mode": "knight",
    "difficulty": "medium",
    "text": "297000000800040290100000800978000060030002070000000000000014609000020000020005004",
    "rating": "medium"
  },
  {
    "id": "B31-knight-medium-07",
    "mode": "knight",
    "difficulty": "medium",
    "text": "800200030000005000200007005080000040040080520506043780000100004000000102050000000",
    "rating": "medium"
  },
  {
    "id": "B31-knight-medium-08",
    "mode": "knight",
    "difficulty": "medium",
    "text": "090030570032000040001040006900306005000010400715000000000000000000100000050890600",
    "rating": "medium"
  },
  {
    "id": "B31-knight-medium-09",
    "mode": "knight",
    "difficulty": "medium",
    "text": "060000019040009500010002700000080100400100600000607000000800900800006070956000000",
    "rating": "medium"
  },
  {
    "id": "B31-knight-medium-10",
    "mode": "knight",
    "difficulty": "medium",
    "text": "700000000000000006014000903060200000230000000100069205002300000000078600070602050",
    "rating": "medium"
  },
  {
    "id": "B31-knight-medium-11",
    "mode": "knight",
    "difficulty": "medium",
    "text": "007930008000018007010050000500300000000082009000579000700060000001000000020703400",
    "rating": "medium"
  },
  {
    "id": "B31-knight-medium-12",
    "mode": "knight",
    "difficulty": "medium",
    "text": "020050700000000059000000100010000400000610005008007012001500047004000000000730061",
    "rating": "medium"
  },
  {
    "id": "B31-knight-medium-13",
    "mode": "knight",
    "difficulty": "medium",
    "text": "070280901000400006020005070300000005019000600000000000000002009900704000206050004",
    "rating": "medium"
  },
  {
    "id": "B31-knight-medium-14",
    "mode": "knight",
    "difficulty": "medium",
    "text": "700016300035000000000035709000600200003008000004000000807004023000090004010000007",
    "rating": "medium"
  },
  {
    "id": "B31-knight-medium-15",
    "mode": "knight",
    "difficulty": "medium",
    "text": "000302000000600950000050000570000000020809570009003100000000000060095001000701260",
    "rating": "medium"
  },
  {
    "id": "B31-knight-medium-16",
    "mode": "knight",
    "difficulty": "medium",
    "text": "006002174002100000000060009000829001000040600001000098600000400000000006400350000",
    "rating": "medium"
  },
  {
    "id": "B31-knight-medium-17",
    "mode": "knight",
    "difficulty": "medium",
    "text": "000000003000700009010609002090007130407106090000000000900070000070008900000900201",
    "rating": "medium"
  },
  {
    "id": "B31-knight-medium-18",
    "mode": "knight",
    "difficulty": "medium",
    "text": "000000000000060400000435007050070600809000000604050009000006000000043018043500700",
    "rating": "medium"
  },
  {
    "id": "B31-knight-medium-19",
    "mode": "knight",
    "difficulty": "medium",
    "text": "130950000000000030000002007300000400000080320001320500000004010060010000800200760",
    "rating": "medium"
  },
  {
    "id": "B31-knight-medium-20",
    "mode": "knight",
    "difficulty": "medium",
    "text": "500400018060018000000570000094000180003105700100090000006200050001800000000000000",
    "rating": "medium"
  },
  {
    "id": "B31-knight-hard-04",
    "mode": "knight",
    "difficulty": "hard",
    "text": "008000100000000039030000700070060000000000000000015400000086300300000006000000000",
    "rating": "hard"
  },
  {
    "id": "B31-knight-hard-05",
    "mode": "knight",
    "difficulty": "hard",
    "text": "000030800800000200007001004100000006000005000000080000009000370000000000000070000",
    "rating": "hard"
  },
  {
    "id": "B31-knight-hard-06",
    "mode": "knight",
    "difficulty": "hard",
    "text": "000000000000007000057800100000200508000000060000000030600095004000000000000010090",
    "rating": "hard"
  },
  {
    "id": "B31-knight-hard-07",
    "mode": "knight",
    "difficulty": "hard",
    "text": "004000000006000000000000100703000005000200400090007080007001000000000004002000000",
    "rating": "hard"
  },
  {
    "id": "B31-knight-hard-08",
    "mode": "knight",
    "difficulty": "hard",
    "text": "000060000004000800000004500009200000000000006000000050000000601670300020000070040",
    "rating": "hard"
  },
  {
    "id": "B31-knight-hard-09",
    "mode": "knight",
    "difficulty": "hard",
    "text": "600500200800009003300007600060001000082000050000000000000030000200000000010000000",
    "rating": "hard"
  },
  {
    "id": "B31-knight-hard-10",
    "mode": "knight",
    "difficulty": "hard",
    "text": "002000000007000060000090800080000009000000000200000000000400050003978000021003000",
    "rating": "hard"
  },
  {
    "id": "B31-knight-hard-11",
    "mode": "knight",
    "difficulty": "hard",
    "text": "860007000004000000007100000000009005000400000200010000500020001070000000000000000",
    "rating": "hard"
  },
  {
    "id": "B31-knight-hard-12",
    "mode": "knight",
    "difficulty": "hard",
    "text": "000002010000000000902000000000090200000600790000001040004000008300000000000000160",
    "rating": "hard"
  },
  {
    "id": "B31-knight-hard-13",
    "mode": "knight",
    "difficulty": "hard",
    "text": "200005000000000290000000640000000000000000010870006000000000009500020004009060530",
    "rating": "hard"
  },
  {
    "id": "B31-knight-hard-14",
    "mode": "knight",
    "difficulty": "hard",
    "text": "405000000000000004000000076000000392006000040000000000000708000060003000900015000",
    "rating": "hard"
  },
  {
    "id": "B31-knight-hard-15",
    "mode": "knight",
    "difficulty": "hard",
    "text": "000000000000000210206030007008000000000000020700050040004800060100000000070100000",
    "rating": "hard"
  },
  {
    "id": "B31-knight-hard-16",
    "mode": "knight",
    "difficulty": "hard",
    "text": "000000060080000000000005900000000002004000700630700000000000000000320500007508040",
    "rating": "hard"
  },
  {
    "id": "B31-knight-hard-17",
    "mode": "knight",
    "difficulty": "hard",
    "text": "000002000000000900000070000000600130008100000005009000700000000000000000001000802",
    "rating": "hard"
  },
  {
    "id": "B31-knight-hard-18",
    "mode": "knight",
    "difficulty": "hard",
    "text": "000000000000000000009040500410002000000003005600000002007000900000004000030000000",
    "rating": "hard"
  },
  {
    "id": "B31-knight-hard-19",
    "mode": "knight",
    "difficulty": "hard",
    "text": "430000002000000000000002000000080710000043000000006200000300000001000090098000600",
    "rating": "hard"
  },
  {
    "id": "B31-knight-hard-20",
    "mode": "knight",
    "difficulty": "hard",
    "text": "300090062000000180000103000000900000007000000004801000000000000000200000006000700",
    "rating": "hard"
  }
]; /* BANK_END */
  var modes = [
    { id: "classic", label: "经典九宫", description: "每行、每列和每个九宫格都填入 1–9，数字不重复。" },
    { id: "diagonal", label: "对角线", description: "遵守行、列、九宫格规则，两条主对角线也各自填入不重复的 1–9。" },
    { id: "hyper", label: "窗口数独", description: "遵守行、列、九宫格规则，四个标出的额外 3×3 窗口也各自包含不重复的 1–9。" },
    { id: "knight", label: "骑士数独", description: "遵守行、列、九宫格规则，横一纵二或横二纵一的马步相隔格，数字不能相同。" }
  ];
  var levels = [
    { id: "easy", label: "入门", description: "以单格唯一候选为主，适合熟悉当前玩法。" },
    { id: "medium", label: "标准", description: "结合单格候选与某个区域中数字的唯一位置。" },
    { id: "hard", label: "进阶", description: "需要锁定候选或数对等进阶排除，无需试填分支。" },
    { id: "master", label: "极境", description: "适合耐心推演的复杂棋局。" }
  ];
  var configs = Object.create(null), solutions = Object.create(null);
  function modeId(mode) {
    mode = (mode && typeof mode === "object" ? mode.mode : mode) || "classic";
    if (!modes.some(function (m) { return m.id === mode; })) throw new RangeError("Unknown Sudoku mode.");
    return mode;
  }
  function legacyConfig(mode) {
    mode = modeId(mode);
    if (configs[mode]) return configs[mode];
    var units = [], peers = [], i, j;
    for (i = 0; i < 9; i++) {
      var row = [], col = [], box = [];
      for (j = 0; j < 9; j++) {
        row.push(i * 9 + j);
        col.push(j * 9 + i);
        box.push((Math.floor(i / 3) * 3 + Math.floor(j / 3)) * 9 + i % 3 * 3 + j % 3);
      }
      units.push({ cells: row, label: "第 " + (i + 1) + " 行" });
      units.push({ cells: col, label: "第 " + (i + 1) + " 列" });
      units.push({ cells: box, label: "第 " + (i + 1) + " 宫" });
    }
    if (mode === "diagonal") {
      units.push({ cells: Array.from({ length: 9 }, function (_, n) { return n * 10; }), label: "左上至右下的对角线" });
      units.push({ cells: Array.from({ length: 9 }, function (_, n) { return (n + 1) * 8; }), label: "右上至左下的对角线" });
    }
    if (mode === "hyper") {
      [[1,1],[1,5],[5,1],[5,5]].forEach(function (origin, n) {
        var cells = [];
        for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) cells.push((origin[0] + r) * 9 + origin[1] + c);
        units.push({ cells: cells, label: "第 " + (n + 1) + " 个额外窗口" });
      });
    }
    for (i = 0; i < 81; i++) peers.push(new Set());
    units.forEach(function (unit) {
      unit.cells.forEach(function (a) {
        unit.cells.forEach(function (b) { if (a !== b) peers[a].add(b); });
      });
    });
    if (mode === "knight") {
      var moves = [[1,2],[1,-2],[-1,2],[-1,-2],[2,1],[2,-1],[-2,1],[-2,-1]];
      for (i = 0; i < 81; i++) moves.forEach(function (move) {
        var r = Math.floor(i / 9) + move[0], c = i % 9 + move[1];
        if (r >= 0 && r < 9 && c >= 0 && c < 9) peers[i].add(r * 9 + c);
      });
    }
    return configs[mode] = { mode: mode, units: units, peers: peers.map(function (set) { return Array.from(set); }) };
  }
  var multiModeIds = ["twin", "samurai"], layoutCache = Object.create(null);
  function isMultiMode(context) { return multiModeIds.indexOf(modeId(context)) >= 0; }
  function getLayout(context) {
    var mode = modeId(context);
    if (layoutCache[mode]) return layoutCache[mode];
    var origins = mode === "twin" ? [
      ["northwest", "左上盘", 0, 0], ["southeast", "右下盘", 6, 6]
    ] : mode === "samurai" ? [
      ["northwest", "左上盘", 0, 0], ["northeast", "右上盘", 0, 12],
      ["center", "中央盘", 6, 6], ["southwest", "左下盘", 12, 0],
      ["southeast", "右下盘", 12, 12]
    ] : [["main", "棋盘", 0, 0]];
    var occupied = Object.create(null), rows = 0, columns = 0;
    origins.forEach(function(o) {
      rows = Math.max(rows, o[2] + 9); columns = Math.max(columns, o[3] + 9);
      for (var r=0;r<9;r++) for (var c=0;c<9;c++) {
        var row=o[2]+r,col=o[3]+c,key=row+","+col;
        if (!occupied[key]) occupied[key]={row:row,col:col,boards:[]};
        occupied[key].boards.push({id:o[0],label:o[1],row:r,col:c});
      }
    });
    var cells=Object.keys(occupied).map(function(k){return occupied[k];}).sort(function(a,b){return a.row-b.row||a.col-b.col;});
    var indices=Object.create(null);
    cells.forEach(function(cell,index){indices[cell.row+","+cell.col]=index;});
    var boards=origins.map(function(o){return {id:o[0],label:o[1],row:o[2],col:o[3],cells:Array.from({length:81},function(_,i){return indices[(o[2]+Math.floor(i/9))+","+(o[3]+i%9)];})};});
    cells.forEach(function(cell){cell.boards.forEach(Object.freeze);Object.freeze(cell.boards);Object.freeze(cell);});
    boards.forEach(function(board){Object.freeze(board.cells);Object.freeze(board);});
    return layoutCache[mode]=Object.freeze({id:mode,rows:rows,columns:columns,cellCount:cells.length,cells:Object.freeze(cells),boards:Object.freeze(boards)});
  }
  function getCellLabel(index, context) {
    var layout=getLayout(context),cell=layout.cells[index];
    if(!cell)return "";
    if(layout.boards.length===1)return "第 "+(cell.row+1)+" 行第 "+(cell.col+1)+" 列";
    return cell.boards.map(function(b){return b.label+"第 "+(b.row+1)+" 行第 "+(b.col+1)+" 列";}).join(" / ")+(cell.boards.length>1?"（重叠格）":"");
  }
  function multiConfig(mode,clues) {
    var layout=getLayout(mode),units=[],seen=Object.create(null);
    layout.boards.forEach(function(board){
      for(var n=0;n<9;n++){
        var row=[],col=[],box=[];
        for(var j=0;j<9;j++){
          row.push(board.cells[n*9+j]);col.push(board.cells[j*9+n]);
          box.push(board.cells[(Math.floor(n/3)*3+Math.floor(j/3))*9+n%3*3+j%3]);
        }
        [[row,"行"],[col,"列"],[box,"宫"]].forEach(function(item){
          var key=item[0].slice().sort(function(a,b){return a-b;}).join(","),label=board.label+"第 "+(n+1)+" "+item[1];
          if(seen[key])seen[key].label+=" / "+label;
          else {var unit={cells:item[0],label:label};seen[key]=unit;units.push(unit);}
        });
      }
    });
    var peers=Array.from({length:layout.cellCount},function(){return new Set();});
    units.forEach(function(unit){unit.cells.forEach(function(a){unit.cells.forEach(function(b){if(a!==b)peers[a].add(b);});});});
    var unary=new Uint16Array(layout.cellCount);unary.fill(FULL);
    return {mode:mode,clues:clues,units:units,peers:peers.map(function(set){return Array.from(set);}),constraints:[],
      byCell:Array.from({length:layout.cellCount},function(){return [];}),unary:unary};
  }
  function wellFormed(board, length) {
    length = length === undefined ? 81 : length;
    if (!Array.isArray(board) || board.length !== length) return false;
    for (var i = 0; i < length; i++) if (!Number.isInteger(board[i]) || board[i] < 0 || board[i] > 9) return false;
    return true;
  }
  function popcount(n) {
    n -= n >>> 1 & 0x55555555;
    n = (n & 0x33333333) + (n >>> 2 & 0x33333333);
    return ((n + (n >>> 4) & 0x0F0F0F0F) * 0x01010101) >>> 24;
  }
  function digitOf(bit) { return 32 - Math.clz32(bit); }
  function stateFor(board, mode) {
    var cfg = config(mode);
    if (!wellFormed(board, cfg.peers.length)) return null;
    var state = { board: board.slice(), peers: cfg.peers, used: new Uint16Array(board.length), counts: new Uint8Array(board.length * 9) };
    for (var i = 0; i < board.length; i++) {
      var digit = board[i];
      if (!digit) continue;
      var bit = 1 << (digit - 1);
      if (state.used[i] & bit) return null;
      cfg.peers[i].forEach(function (peer) {
        state.counts[peer * 9 + digit - 1]++;
        state.used[peer] |= bit;
      });
    }
    return state;
  }
  function runLegacySearch(board, limit, mode) {
    var state = stateFor(board, mode);
    if (!state) return { count: 0, solution: null };
    var count = 0, first = null;
    function visit() {
      var best = -1, mask = 0, size = 10, degree = -1;
      for (var i = 0; i < state.board.length; i++) {
        if (state.board[i]) continue;
        var available = FULL & ~state.used[i];
        if (!available) return;
        var candidateSize = popcount(available);
        if (candidateSize < size || candidateSize === size && state.peers[i].length > degree) {
          best = i; mask = available; size = candidateSize; degree = state.peers[i].length;
        }
        if (candidateSize === 1) break;
      }
      if (best < 0) { count++; if (!first) first = state.board.slice(); return; }
      var peers = state.peers[best];
      while (mask && count < limit) {
        var bit = mask & -mask, digit = digitOf(bit);
        mask ^= bit;
        state.board[best] = digit;
        for (var p = 0; p < peers.length; p++) {
          var peer = peers[p];
          state.counts[peer * 9 + digit - 1]++;
          state.used[peer] |= bit;
        }
        visit();
        for (var q = 0; q < peers.length; q++) {
          var index = peers[q];
          if (--state.counts[index * 9 + digit - 1] === 0) state.used[index] &= ~bit;
        }
        state.board[best] = 0;
      }
    }
    visit();
    return { count: count, solution: first };
  }
  function solve(board, mode) { return runSearch(board, 1, mode).solution; }
  function countSolutions(board, limit, mode) {
    limit = limit === undefined ? 2 : limit;
    if (!Number.isInteger(limit) || limit < 1) throw new RangeError("Solution limit must be a positive integer.");
    return runSearch(board, limit, mode).count;
  }
  function validateComplete(board, mode) {
    return wellFormed(board, getLayout(mode).cellCount) && board.every(function (n) { return n > 0; }) && stateFor(board, mode) !== null && validConstraints(board, config(mode));
  }
  function candidates(board, index, mode) {
    var cfg = config(mode);
    if (!wellFormed(board, cfg.peers.length) || !Number.isInteger(index) || index < 0 || index >= cfg.peers.length || board[index]) return [];
    var mask=candidateMask(board.slice(),index,cfg),result=[];
    for(var digit=1;digit<=9;digit++)if(mask&(1<<(digit-1)))result.push(digit);
    return result;
  }
  function arePeers(a, b, mode) {
    return Number.isInteger(a) && Number.isInteger(b) && a >= 0 && a < getLayout(mode).cellCount && b >= 0 && b < getLayout(mode).cellCount && config(mode).peers[a].indexOf(b) >= 0;
  }
  function hashSeed(seed) {
    var text = String(seed), hash = 2166136261;
    for (var i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
    return hash >>> 0;
  }
  function randomGenerator(seed) {
    var a = hashSeed(seed);
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function shuffled(list, random) {
    list = list.slice();
    for (var i = list.length - 1; i > 0; i--) {
      var n = Math.floor(random() * (i + 1)), old = list[n];
      list[n] = list[i]; list[i] = old;
    }
    return list;
  }
  function unitOrder(random) {
    var result = [];
    shuffled([0,1,2], random).forEach(function (band) {
      shuffled([0,1,2], random).forEach(function (offset) { result.push(band * 3 + offset); });
    });
    return result;
  }
  function getLegacyPuzzle(difficulty, seed, mode, options) {
    options = options || {};
    mode = modeId(mode);
    difficulty = difficulty || "easy";
    if (difficulty === "expert") difficulty = "master";
    if (!getDifficulties(mode).some(function (item) { return item.id === difficulty; })) throw new RangeError("Unknown difficulty for this mode.");
    var pool = BANK.filter(function (item) { return item.mode === mode && item.difficulty === difficulty && (!options.legacyPool || LEGACY_SEED_IDS.indexOf(item.id) >= 0); });
    if (!pool.length) throw new Error("No puzzle available for selected mode and difficulty.");
    if (seed === undefined) {
      seed = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
      if (typeof crypto !== "undefined" && crypto.getRandomValues) {
        var nonce = new Uint32Array(2); crypto.getRandomValues(nonce);
        seed += "-" + nonce[0].toString(36) + nonce[1].toString(36);
      }
    }
    var random = randomGenerator(seed), chosen = Math.floor(random() * pool.length);
    var source = options.sourceId === undefined ? pool[chosen] : pool.find(function (item) { return item.id === options.sourceId; });
    if (!source) throw new RangeError("Unknown puzzle source for this mode and difficulty.");
    var givens = source.text.split("").map(Number);
    if (!solutions[source.id]) solutions[source.id] = solve(givens, mode);
    var solution = solutions[source.id];
    if (!solution) throw new Error("Invalid stored puzzle.");
    var digits = [0].concat(shuffled([1,2,3,4,5,6,7,8,9], random));
    var rows = unitOrder(random), cols = unitOrder(random), transpose = random() < 0.5;
    var rotations = Math.floor(random() * 4), reflect = random() < 0.5;
    var output = [], answer = [];
    for (var r = 0; r < 9; r++) for (var c = 0; c < 9; c++) {
      var from;
      if (mode === "classic") from = transpose ? rows[c] * 9 + cols[r] : rows[r] * 9 + cols[c];
      else {
        var rr = r, cc = reflect ? 8 - c : c;
        for (var turn = 0; turn < rotations; turn++) { var oldR = rr; rr = cc; cc = 8 - oldR; }
        from = rr * 9 + cc;
      }
      output.push(digits[givens[from]]); answer.push(digits[solution[from]]);
    }
    return { id: source.id + "-" + hashSeed(seed).toString(36).toUpperCase(), sourceId: source.id, mode: mode,
      difficulty: difficulty, givens: output, solution: answer, rating: source.rating || difficulty, clues: normalizeClues(mode) };
  }
  function getHint(board, givens, solution, mode) {
    var cfg = config(mode);
    if (!wellFormed(board, cfg.peers.length) || !wellFormed(givens, cfg.peers.length) || !validateComplete(solution, mode)) return null;
    for (var i = 0; i < board.length; i++) if (givens[i] && (board[i] !== givens[i] || solution[i] !== givens[i])) return null;
    for (var wrong = 0; wrong < board.length; wrong++) if (!givens[wrong] && board[wrong] && board[wrong] !== solution[wrong]) {
      return { index: wrong, value: solution[wrong], reason: getCellLabel(wrong, mode) + "与本题唯一解不符，正确数字为 " + solution[wrong] + "。" };
    }
    var available = new Array(board.length);
    for (var empty = 0; empty < board.length; empty++) {
      if (board[empty]) continue;
      available[empty] = candidates(board, empty, mode);
      if (available[empty].length === 1) return { index: empty, value: available[empty][0],
        reason: "按照当前玩法的行、列、宫及附加规则排除后，这一格只剩数字 " + available[empty][0] + "。" };
    }
    for (var u = 0; u < cfg.units.length; u++) for (var digit = 1; digit <= 9; digit++) {
      var places = cfg.units[u].cells.filter(function (cell) { return available[cell] && available[cell].indexOf(digit) >= 0; });
      if (places.length === 1) return { index: places[0], value: digit, reason: cfg.units[u].label + "中，数字 " + digit + " 只能放在这一格。" };
    }
    var best = -1, size = 10;
    for (var p = 0; p < board.length; p++) if (available[p] && available[p].length < size) { best = p; size = available[p].length; }
    if (best < 0) return null;
    return { index: best, value: solution[best], reason: "精确求解提示：此处需要进一步候选排除或深入推理；本题唯一解在这一格为 " + solution[best] + "。" };
  }
  function getModes() { return modes.map(function (item) { return Object.assign({}, item); }); }
  function getDifficulties(mode) {
    mode = modeId(mode);
    return levels.filter(function (item) { return mode === "classic" || item.id !== "master"; }).map(function (item) { var copy=Object.assign({}, item); if(legacyModes.indexOf(mode)<0)copy.description="按题面线索密度分档；附加规则参与推理，实际体感因玩法而异。"; return copy; });
  }
  function getCellDecorations(index, mode) {
    mode = modeId(mode);
    if (isMultiMode(mode)) {
      var cell=getLayout(mode).cells[index];
      return cell ? (cell.boards.length>1?["multi-shared"]:[]).concat(cell.boards.map(function(b){return "multi-board-"+b.id;})) : [];
    }
    var classes = [], r = Math.floor(index / 9), c = index % 9;
    if (mode === "diagonal") {
      if (r === c) classes.push("diagonal-main");
      if (r + c === 8) classes.push("diagonal-anti");
    }
    if (mode === "hyper") [[1,1],[1,5],[5,1],[5,5]].forEach(function (origin, n) {
      if (r < origin[0] || r > origin[0] + 2 || c < origin[1] || c > origin[1] + 2) return;
      classes.push("hyper-" + n);
      if (r === origin[0]) classes.push("window-top");
      if (r === origin[0] + 2) classes.push("window-bottom");
      if (c === origin[1]) classes.push("window-left");
      if (c === origin[1] + 2) classes.push("window-right");
    });
    return classes;
  }

  var extraModes = [
    ["twin","双盘联结","双盘","多盘","两个九宫棋盘共用一个 3×3 宫；重叠格同时满足两盘的行、列、宫规则。"],
    ["samurai","武士五盘","武士","多盘","五个九宫棋盘以四个重叠宫相连；同一重叠格在相邻两盘中共用一个数字。"],
    ["king","国王数独","国王","位置","斜向相邻的格子不能填相同数字。"],
    ["nonconsecutive","非连续数独","非连续","位置","上下左右相邻格的数字之差不能为 1。"],
    ["miracle","奇迹数独","奇迹","位置","同时遵守骑士、国王和相邻不连续规则。"],
    ["disjoint","同位组数独","同位组","区域","九个宫中相同位置的九格也各含 1–9。"],
    ["jigsaw","不规则宫数独","不规则宫","区域","每行、每列和每个描边的不规则宫各含 1–9；不使用普通方宫。"],
    ["odd-even","奇偶数独","奇偶","标记","圆形标记格填奇数，方形标记格填偶数。"],
    ["killer","杀手数独","杀手","求和","每个虚线笼内数字不重复，数字之和等于笼角标。"],
    ["thermo","温度计数独","温度计","线条","从圆球到尖端，温度计上的数字严格递增。"],
    ["arrow","箭头数独","箭头","求和","圆圈内的数字等于相连箭身各格数字之和。"],
    ["kropki","黑白点数独","黑白点","相邻","白点两侧相差 1，黑点两侧为 2 倍；未标记的边不附加约束。"],
    ["xv","XV 数独","XV","相邻","V 两侧之和为 5，X 两侧之和为 10；未标记的边不附加约束。"],
    ["greater","不等号数独","不等号","相邻","标出的不等号两侧须满足大小关系；未标记的边不附加约束。"],
    ["renban","连续线数独","连续线","线条","每条线上的数字互不重复，组成一组连续数字，排列顺序不限。"],
    ["whispers","德语耳语数独","耳语","线条","绿线上连续相邻的两个数字之差至少为 5。"],
    ["palindrome","回文数独","回文","线条","每条线从两端读到的数字序列相同。"],
    ["between","两端之间数独","两端之间","线条","线上内部数字均严格介于两端数字之间。"],
    ["lockout","锁定线数独","锁定线","线条","两端相差至少 4，内部数字均严格落在两端所围区间之外。"],
    ["entropic","熵线数独","熵线","线条","线上每连续三格分别来自 1–3、4–6、7–9 三组。"],
    ["modular","模三线数独","模三线","线条","线上每连续三格除以 3 的余数各不相同。"],
    ["region-sum","宫和线数独","宫和线","求和","每条线在同一宫内的各段连续线段，数字之和相等。"],
    ["sandwich","三明治数独","三明治","外围","行或列旁的数字是该行列中 1 与 9 之间数字的和。"],
    ["skyscraper","摩天楼数独","摩天楼","外围","外围数字表示从该方向看到的楼数；较高楼会挡住后面的较矮楼。"],
    ["xsum","X 和数独","X 和","外围","从线索方向起，首格为 X，前 X 格的数字之和等于外围线索。"],
    ["littlekiller","小杀手数独","小杀手","外围","箭头所指斜线各格之和等于外围数字；斜线上不额外禁止重复。"],
    ["clone","克隆数独","克隆","标记","同色两个形状中，对应位置的数字相同。"],
    ["quadruple","四格提示数独","四格提示","标记","交点标出的数字必须出现在周围四格中，重复标注须出现相应次数。"]
  ];
  modes.forEach(function(m) { m.shortLabel = {classic:"经典",diagonal:"对角线",hyper:"窗口",knight:"骑士"}[m.id]; m.category = m.id === "knight" ? "位置" : "基础"; });
  extraModes.forEach(function(m) { modes.push({id:m[0],label:m[1],shortLabel:m[2],category:m[3],description:m[4]}); });
  var legacyModes = ["classic","diagonal","hyper","knight"];
  var lineTypes = ["thermo","arrow","renban","whispers","palindrome","between","lockout","entropic","modular","region-sum"];
  var outsideTypes = ["sandwich","skyscraper","xsum","littlekiller"];
  var contextCache = typeof WeakMap !== "undefined" ? new WeakMap() : null;
  var plainConfigs = Object.create(null);
  var variantBank = typeof module === "object" && module.exports ? require("./variant-bank.js") :
    (typeof globalThis !== "undefined" ? globalThis.SudokuVariantBank || [] : []);

  var multigridBank = typeof module === "object" && module.exports ? require("./multigrid-bank.js") :
    (typeof globalThis !== "undefined" ? globalThis.SudokuMultigridBank || [] : []);

  function normalizeClues(mode, input) {
    mode = modeId(mode);
    if (input === undefined || input === null) input = {};
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("Invalid clue document.");
    if (input.version !== undefined && input.version !== 1) throw new RangeError("Unsupported clue version.");
    var result = {version:1,regions:[],cages:[],lines:[],edges:[],parity:[],outside:[],clones:[],quadruples:[]};
    Object.keys(input).forEach(function(key) { if (!Object.prototype.hasOwnProperty.call(result,key)) throw new RangeError("Unknown clue field: " + key); });
    if (isMultiMode(mode)) {
      Object.keys(result).forEach(function(key){
        if(key!=="version" && input[key]!==undefined && (!Array.isArray(input[key])||input[key].length))
          throw new RangeError("Multi-grid modes use fixed overlapping boards, without extra clues.");
      });
      return result;
    }
    function integer(n, min, max) { return Number.isInteger(n) && n >= min && n <= max; }
    function cells(value, min, max) {
      if (!Array.isArray(value) || value.length < min || value.length > max ||
          !value.every(function(n) { return integer(n,0,80); }) || new Set(value).size !== value.length)
        throw new RangeError("Invalid clue cells.");
      return value.slice();
    }
    function collection(key, max, fn) {
      var value = input[key] === undefined ? [] : input[key];
      if (!Array.isArray(value) || value.length > max) throw new RangeError("Too many or invalid " + key + " clues.");
      result[key] = value.map(function(item) {
        if (!item || typeof item !== "object" || Array.isArray(item)) throw new RangeError("Invalid " + key + " clue.");
        return fn(item);
      });
    }
    function neighbours(a,b,diagonal) {
      var dr=Math.abs(Math.floor(a/9)-Math.floor(b/9)), dc=Math.abs(a%9-b%9);
      return diagonal ? Math.max(dr,dc) === 1 : dr+dc === 1;
    }
    if (input.regions !== undefined && !Array.isArray(input.regions)) throw new RangeError("Invalid region map.");
    if (input.regions && input.regions.length) {
      if (mode !== "jigsaw" || !Array.isArray(input.regions) || input.regions.length !== 81 ||
          !input.regions.every(function(n){return integer(n,0,8);})) throw new RangeError("Invalid region map.");
      result.regions = input.regions.slice();
      for (var region=0;region<9;region++) {
        var group=[]; result.regions.forEach(function(n,i){if(n===region)group.push(i);});
        if(group.length!==9)throw new RangeError("Each region must contain nine cells.");
        var seen=new Set([group[0]]), todo=[group[0]];
        while(todo.length) { var a=todo.pop(); group.forEach(function(b){if(!seen.has(b)&&neighbours(a,b,false)){seen.add(b);todo.push(b);}}); }
        if(seen.size!==9)throw new RangeError("Regions must be connected.");
      }
    }
    collection("cages",81,function(item){
      var c=cells(item.cells,1,9), sum=item.sum;
      var reached=new Set([c[0]]),queue=[c[0]];
      while(queue.length){var current=queue.pop();c.forEach(function(next){if(!reached.has(next)&&neighbours(current,next,false)){reached.add(next);queue.push(next);}});}
      if(reached.size!==c.length)throw new RangeError("Killer cages must be connected.");
      if(!integer(sum,c.length*(c.length+1)/2,c.length*(19-c.length)/2)||item.unique!==true)throw new RangeError("Invalid killer cage.");
      return {cells:c,sum:sum,unique:true};
    });
    collection("lines",48,function(item){
      var c=cells(item.cells,2,16);
      if(lineTypes.indexOf(item.type)<0 || item.type!==mode)throw new RangeError("Unknown line rule.");
      if((item.type==="thermo"||item.type==="renban")&&c.length>9)throw new RangeError("Line too long.");
      if(item.type!=="thermo" && c.length<3)throw new RangeError("Line needs three or more cells.");
      for(var i=1;i<c.length;i++)if(!neighbours(c[i-1],c[i],true))throw new RangeError("Disconnected line.");
      if(item.type==="region-sum"&&new Set(c.map(function(i){return Math.floor(i/27)*3+Math.floor(i%9/3);})).size<2)
        throw new RangeError("Region-sum line must cross a box boundary.");
      return {type:item.type,cells:c};
    });
    collection("edges",144,function(item){
      var c=cells(item.cells,2,2), kind=item.type;
      if(!neighbours(c[0],c[1],false))throw new RangeError("Edge cells must touch.");
      if(["kropki-white","kropki-black","xv","greater"].indexOf(kind)<0)throw new RangeError("Unknown edge rule.");
      if(kind==="xv"&&item.value!==5&&item.value!==10)throw new RangeError("XV sum must be 5 or 10.");
      return kind==="xv"?{type:kind,cells:c,value:item.value}:{type:kind,cells:c};
    });
    collection("parity",81,function(item){
      if(!integer(item.cell,0,80)||["odd","even"].indexOf(item.parity)<0)throw new RangeError("Invalid parity clue.");
      return {cell:item.cell,parity:item.parity};
    });
    if(new Set(result.parity.map(function(p){return p.cell;})).size!==result.parity.length)throw new RangeError("Duplicate parity clue.");
    collection("outside",72,function(item){
      var c=cells(item.cells,item.type==="littlekiller"?2:9,9), side=item.side, n=item.index;
      if(outsideTypes.indexOf(item.type)<0||item.type!==mode||["top","right","bottom","left"].indexOf(side)<0||
          !integer(n,0,8)||!integer(item.value,0,81))throw new RangeError("Invalid outside clue.");
      var first=side==="top"?n:side==="bottom"?72+n:side==="left"?n*9:n*9+8;
      if(c[0]!==first)throw new RangeError("Outside clue origin does not match its side.");
      if(item.type==="littlekiller") {
        var dr=Math.floor(c[1]/9)-Math.floor(c[0]/9),dc=c[1]%9-c[0]%9;
        if(Math.abs(dr)!==1||Math.abs(dc)!==1||c.some(function(v,i){return Math.floor(v/9)!==Math.floor(c[0]/9)+dr*i||v%9!==c[0]%9+dc*i;}))
          throw new RangeError("Little killer path must be a straight diagonal.");
        var nr=Math.floor(c[c.length-1]/9)+dr,nc=c[c.length-1]%9+dc;
        if(nr>=0&&nr<9&&nc>=0&&nc<9)throw new RangeError("Little killer path must reach the edge.");
      } else {
        var step=side==="top"?9:side==="bottom"?-9:side==="left"?1:-1;
        if(c.some(function(v,i){return v!==first+step*i;}))throw new RangeError("Invalid outside row or column.");
      }
      if(item.type==="skyscraper"&&!integer(item.value,1,9))throw new RangeError("Invalid visibility count.");
      if(item.type==="sandwich"&&item.value>35)throw new RangeError("Invalid sandwich sum.");
      if((item.type==="xsum"||item.type==="littlekiller")&&item.value<1)throw new RangeError("Invalid outside sum.");
      return {type:item.type,cells:c,value:item.value,side:side,index:n};
    });
    collection("clones",32,function(item){
      var a=cells(item.a,2,9),b=cells(item.b,a.length,a.length);
      if(a.some(function(v){return b.indexOf(v)>=0;}))throw new RangeError("Clone regions must not overlap.");
      var dr=Math.floor(b[0]/9)-Math.floor(a[0]/9),dc=b[0]%9-a[0]%9;
      if(a.some(function(v,i){return Math.floor(b[i]/9)-Math.floor(v/9)!==dr||b[i]%9-v%9!==dc;}))throw new RangeError("Clone shapes must correspond.");
      return {a:a,b:b};
    });
    collection("quadruples",64,function(item){
      var c=cells(item.cells,4,4).sort(function(a,b){return a-b;}),v=item.values;
      if(c[0]%9===8||c[2]!==c[0]+9||c[1]!==c[0]+1||c[3]!==c[0]+10||
         !Array.isArray(v)||!v.length||v.length>4||!v.every(function(n){return integer(n,1,9);}))throw new RangeError("Invalid quadruple.");
      return {cells:c,values:v.slice().sort(function(a,b){return a-b;})};
    });
    var required=mode==="jigsaw"?"regions":mode==="killer"?"cages":lineTypes.indexOf(mode)>=0?"lines":
      ["kropki","xv","greater"].indexOf(mode)>=0?"edges":mode==="odd-even"?"parity":
      outsideTypes.indexOf(mode)>=0?"outside":mode==="clone"?"clones":mode==="quadruple"?"quadruples":null;
    Object.keys(result).forEach(function(key){
      if(key!=="version"&&result[key].length&&key!==required)throw new RangeError("Clues do not match the selected mode.");
    });
    if(required&&!result[required].length)throw new RangeError("This mode requires " + required + " clues.");
    if(mode==="killer") {
      var covered=result.cages.reduce(function(a,c){return a.concat(c.cells);},[]);
      if(covered.length!==81||new Set(covered).size!==81)throw new RangeError("Killer cages must partition the board.");
    }
    if(mode==="kropki"&&result.edges.some(function(e){return e.type.indexOf("kropki-")!==0;})||
       mode==="xv"&&result.edges.some(function(e){return e.type!=="xv";})||
       mode==="greater"&&result.edges.some(function(e){return e.type!=="greater";}))throw new RangeError("Edge type does not match mode.");
    return result;
  }

  function config(context) {
    var mode=modeId(context), object=context&&typeof context==="object";
    if(object&&contextCache&&contextCache.has(context))return contextCache.get(context);
    if(!object&&plainConfigs[mode])return plainConfigs[mode];
    var clues=normalizeClues(mode,object?context.clues:undefined);
    if(isMultiMode(mode)){
      var multi=multiConfig(mode,clues);
      if(object&&contextCache)contextCache.set(context,multi);else plainConfigs[mode]=multi;
      return multi;
    }
    var base=legacyConfig(legacyModes.indexOf(mode)>=0?mode:"classic");
    var units=base.units.map(function(u){return {cells:u.cells.slice(),label:u.label};});
    if(mode==="jigsaw")units=units.map(function(u,i){return i%3===2?{cells:clues.regions.reduce(function(a,n,j){if(n===Math.floor(i/3))a.push(j);return a;},[]),label:"第 "+(Math.floor(i/3)+1)+" 个不规则宫"}:u;});
    if(mode==="disjoint")for(var d=0;d<9;d++){
      var group=[];for(var box=0;box<9;box++)group.push((Math.floor(box/3)*3+Math.floor(d/3))*9+(box%3)*3+d%3);
      units.push({cells:group,label:"第 "+(d+1)+" 个同位组"});
    }
    var peers=Array.from({length:81},function(){return new Set();});
    units.forEach(function(u){u.cells.forEach(function(a){u.cells.forEach(function(b){if(a!==b)peers[a].add(b);});});});
    if(mode==="knight"||mode==="miracle")for(var k=0;k<81;k++)[[1,2],[1,-2],[-1,2],[-1,-2],[2,1],[2,-1],[-2,1],[-2,-1]].forEach(function(m){
      var r=Math.floor(k/9)+m[0],c=k%9+m[1];if(r>=0&&r<9&&c>=0&&c<9)peers[k].add(r*9+c);
    });
    if(mode==="king"||mode==="miracle")for(var g=0;g<81;g++)[[-1,-1],[-1,1],[1,-1],[1,1]].forEach(function(m){
      var r=Math.floor(g/9)+m[0],c=g%9+m[1];if(r>=0&&r<9&&c>=0&&c<9)peers[g].add(r*9+c);
    });
    var constraints=[],byCell=Array.from({length:81},function(){return [];}),unary=new Uint16Array(81);unary.fill(FULL);
    function add(c){var index=constraints.length;constraints.push(c);c.cells.forEach(function(i){byCell[i].push(index);});}
    if(mode==="nonconsecutive"||mode==="miracle")for(var n=0;n<81;n++){
      if(n%9<8)add({type:"nonconsecutive",cells:[n,n+1]});
      if(n<72)add({type:"nonconsecutive",cells:[n,n+9]});
    }
    clues.parity.forEach(function(p){
      unary[p.cell]=p.parity==="odd"?341:170;add({type:"parity",cells:[p.cell],parity:p.parity});
    });
    clues.cages.forEach(function(c){
      c.cells.forEach(function(a){c.cells.forEach(function(b){if(a!==b)peers[a].add(b);});});
      add({type:"killer",cells:c.cells,sum:c.sum});
    });
    clues.lines.forEach(function(line){
      if(line.type==="renban")line.cells.forEach(function(a){line.cells.forEach(function(b){if(a!==b)peers[a].add(b);});});
      add(line);
    });
    clues.edges.forEach(add);clues.outside.forEach(add);
    clues.clones.forEach(function(c){c.a.forEach(function(a,i){add({type:"equal",cells:[a,c.b[i]]});});});
    clues.quadruples.forEach(function(c){add({type:"quadruple",cells:c.cells,values:c.values});});
    var cfg={mode:mode,clues:clues,units:units,peers:peers.map(function(p){return Array.from(p);}),constraints:constraints,byCell:byCell,unary:unary};
    if(object&&contextCache)contextCache.set(context,cfg);else plainConfigs[mode]=cfg;
    return cfg;
  }
  function sumPossible(values,target){
    var sum=0,empty=0;values.forEach(function(v){if(v)sum+=v;else empty++;});
    return sum+empty<=target&&sum+9*empty>=target;
  }
  function satisfied(rule,board){
    var v=rule.cells.map(function(i){return board[i];}),a=v[0],b=v[1],filled=v.filter(Boolean),type=rule.type,i;
    if(type==="parity")return !a||(a%2===1)===(rule.parity==="odd");
    if(type==="equal")return !a||!b||a===b;
    if(type==="nonconsecutive")return !a||!b||Math.abs(a-b)!==1;
    if(type==="kropki-white")return !a||!b||Math.abs(a-b)===1;
    if(type==="kropki-black")return !a||!b||a===b*2||b===a*2;
    if(type==="xv")return sumPossible(v,rule.value);
    if(type==="greater")return (!a||a>1)&&(!b||b<9)&&(!a||!b||a>b);
    if(type==="killer"||type==="littlekiller")return sumPossible(v,type==="killer"?rule.sum:rule.value);
    if(type==="thermo"){
      for(i=0;i<v.length;i++)if(v[i]){
        if(v[i]<i+1||v[i]>10-v.length+i)return false;
        for(var j=i+1;j<v.length;j++)if(v[j]&&v[j]-v[i]<j-i)return false;
      }return true;
    }
    if(type==="arrow"){
      var tail=v.slice(1);if(a)return sumPossible(tail,a);
      for(i=1;i<=9;i++)if(sumPossible(tail,i))return true;return false;
    }
    if(type==="renban"){
      if(new Set(filled).size!==filled.length)return false;
      return !filled.length||Math.max.apply(null,filled)-Math.min.apply(null,filled)<v.length;
    }
    if(type==="whispers"){
      for(i=1;i<v.length;i++)if(v[i]&&v[i-1]&&Math.abs(v[i]-v[i-1])<5)return false;return true;
    }
    if(type==="palindrome"){
      for(i=0;i<v.length/2;i++)if(v[i]&&v[v.length-1-i]&&v[i]!==v[v.length-1-i])return false;return true;
    }
    if(type==="between"||type==="lockout"){
      for(var left=1;left<=9;left++){if(a&&a!==left)continue;
        for(var right=1;right<=9;right++){if(v[v.length-1]&&v[v.length-1]!==right)continue;
          var low=Math.min(left,right),high=Math.max(left,right);
          if(type==="between"?high-low<2:high-low<4)continue;
          if(v.slice(1,-1).every(function(n){return !n||(type==="between"?n>low&&n<high:n<low||n>high);}))return true;
        }
      }return false;
    }
    if(type==="entropic"||type==="modular"){
      for(i=0;i<v.length-2;i++){
        var groups=v.slice(i,i+3).filter(Boolean).map(function(n){return type==="entropic"?Math.floor((n-1)/3):(n-1)%3;});
        if(new Set(groups).size!==groups.length)return false;
      }return true;
    }
    if(type==="region-sum"){
      var segments=[],last=-1;
      rule.cells.forEach(function(cell,i){var box=Math.floor(cell/27)*3+Math.floor(cell%9/3);if(box!==last){segments.push([]);last=box;}segments[segments.length-1].push(v[i]);});
      var lower=0,upper=Infinity;
      segments.forEach(function(s){var sum=s.reduce(function(t,n){return t+n;},0),empty=s.filter(function(n){return !n;}).length;lower=Math.max(lower,sum+empty);upper=Math.min(upper,sum+empty*9);});
      return lower<=upper;
    }
    if(type==="sandwich"){
      var one=v.indexOf(1),nine=v.indexOf(9);if(one<0||nine<0)return true;
      return sumPossible(v.slice(Math.min(one,nine)+1,Math.max(one,nine)),rule.value);
    }
    if(type==="xsum"){
      if(a)return sumPossible(v.slice(0,a),rule.value);
      for(i=1;i<=9;i++){var trial=v.slice(0,i);trial[0]=i;if(sumPossible(trial,rule.value))return true;}return false;
    }
    if(type==="skyscraper"){
      var high=0,seen=0;
      for(i=0;i<v.length&&v[i];i++)if(v[i]>high){high=v[i];seen++;}
      if(seen>rule.value)return false;
      if(i===v.length)return seen===rule.value;
      return seen+9-high>=rule.value;
    }
    if(type==="quadruple"){
      var available=v.slice(),missing=0;
      rule.values.forEach(function(n){var index=available.indexOf(n);if(index>=0)available.splice(index,1);else missing++;});
      return missing<=v.filter(function(n){return !n;}).length;
    }
    throw new RangeError("Unknown compiled constraint.");
  }
  function validConstraints(board,cfg){return cfg.constraints.every(function(c){return satisfied(c,board);});}
  function candidateMask(board,index,cfg,used){
    var mask=cfg.unary[index]&(used===undefined?FULL&~cfg.peers[index].reduce(function(m,p){return board[p]?m|1<<(board[p]-1):m;},0):FULL&~used);
    if(!cfg.byCell[index].length)return mask;
    var remaining=mask,result=0;
    while(remaining){var bit=remaining&-remaining;remaining^=bit;board[index]=digitOf(bit);
      if(cfg.byCell[index].every(function(c){return satisfied(cfg.constraints[c],board);}))result|=bit;
    }board[index]=0;return result;
  }
  function analyzeSolutions(board,context,options){
    options=options||{};var limit=options.limit===undefined?2:options.limit,maxNodes=options.maxNodes===undefined?Infinity:options.maxNodes;
    var timeLimit=options.timeLimitMs===undefined?Infinity:options.timeLimitMs;
    if(!Number.isInteger(limit)||limit<1||!(maxNodes>0)||!(timeLimit>0))throw new RangeError("Invalid search budget.");
    var cfg=config(context),state=stateFor(board,context),count=0,first=null,nodes=0,exhausted=false,start=Date.now();
    if(!state||!validConstraints(state.board,cfg))return {count:0,solution:null,exhausted:false,nodes:0};
    function visit(){
      if(count>=limit||exhausted)return;
      if(++nodes>maxNodes||(nodes%64===0&&Date.now()-start>timeLimit)){exhausted=true;return;}
      var best=-1,mask=0,size=10,degree=-1;
      for(var i=0;i<state.board.length;i++){
        if(state.board[i])continue;
        var available=candidateMask(state.board,i,cfg,state.used[i]);if(!available)return;
        var n=popcount(available),d=state.peers[i].length+cfg.byCell[i].length;
        if(n<size||n===size&&d>degree){best=i;mask=available;size=n;degree=d;}
        if(n===1)break;
      }
      if(best<0){if(validConstraints(state.board,cfg)){count++;if(!first)first=state.board.slice();}return;}
      var peers=state.peers[best];
      while(mask&&count<limit&&!exhausted){
        var bit=mask&-mask,digit=digitOf(bit);mask^=bit;state.board[best]=digit;
        for(var p=0;p<peers.length;p++){var peer=peers[p];state.counts[peer*9+digit-1]++;state.used[peer]|=bit;}
        visit();
        for(var q=0;q<peers.length;q++){var index=peers[q];if(--state.counts[index*9+digit-1]===0)state.used[index]&=~bit;}
        state.board[best]=0;
      }
    }
    visit();return {count:count,solution:first,exhausted:exhausted,nodes:nodes};
  }
  function runSearch(board,limit,context){
    var cfg=config(context);
    if(!cfg.constraints.length)return runLegacySearch(board,limit,context);
    return analyzeSolutions(board,context,{limit:limit});
  }
  function getConflicts(board,context){
    var cfg=config(context),found=new Set();
    if(!wellFormed(board,cfg.peers.length))return [];
    board.forEach(function(n,i){if(n)cfg.peers[i].forEach(function(j){if(board[j]===n){found.add(i);found.add(j);}});});
    cfg.constraints.forEach(function(c){if(!satisfied(c,board))c.cells.forEach(function(i){if(board[i])found.add(i);});});
    return Array.from(found).sort(function(a,b){return a-b;});
  }
  function getRelatedCells(index,context){
    var cfg=config(context),result=new Set(cfg.peers[index]||[]);
    (cfg.byCell[index]||[]).forEach(function(c){cfg.constraints[c].cells.forEach(function(i){if(i!==index)result.add(i);});});
    return Array.from(result);
  }
  function getPuzzle(difficulty,seed,mode,options){
    options=options||{};
    mode=modeId(mode);
    if(legacyModes.indexOf(mode)>=0)return getLegacyPuzzle(difficulty,seed,mode,options);
    difficulty=difficulty||"easy";
    if(["easy","medium","hard"].indexOf(difficulty)<0)throw new RangeError("Unknown difficulty for this mode.");
    var pool=(isMultiMode(mode)?multigridBank:variantBank).filter(function(p){return p.mode===mode&&p.difficulty===difficulty;});
    if(!pool.length)throw new Error("No verified puzzle available for selected mode.");
    if(seed===undefined)seed=Date.now().toString(36)+"-"+Math.random().toString(36).slice(2);
    var random=randomGenerator(seed),chosen=Math.floor(random()*pool.length);
    var source=options.sourceId===undefined?pool[chosen]:pool.find(function(p){return p.id===options.sourceId;});
    if(!source)throw new RangeError("Unknown puzzle source for this mode and difficulty.");
    var givens=(source.givens||source.text.split("").map(Number)).slice();
    var answer=(source.solution||solve(givens,{mode:mode,clues:source.clues})).slice();
    if(isMultiMode(mode)){
      var symbols=shuffled([1,2,3,4,5,6,7,8,9],random);
      givens=givens.map(function(n){return n?symbols[n-1]:0;});
      answer=answer.map(function(n){return symbols[n-1];});
    }
    return {id:source.id+"-"+hashSeed(seed).toString(36).toUpperCase(),sourceId:source.id,mode:mode,difficulty:difficulty,
      givens:givens,solution:answer,clues:normalizeClues(mode,source.clues),rating:"density-"+difficulty};
  }

  var LEGACY_SEED_IDS = ["E01", "E02", "M03", "E03", "M01", "M02", "X03", "H02", "X01", "X02", "H03", "D-E1", "D-E2", "D-E3", "D-M1", "D-M2", "D-M3", "D-H1", "D-H2", "D-H3", "H-E1", "H-E2", "H-E3", "H-M1", "H-M2", "H-M3", "H-H1", "H-H2", "H-H3", "K-E1", "K-E2", "K-E3", "K-M1", "K-M2", "K-M3", "K-H1", "K-H2", "K-H3"];

  function getPuzzleCatalog(mode, difficulty) {
    var selectedMode = mode === undefined ? null : modeId(mode);
    if (difficulty === "expert") difficulty = "master";
    return BANK.concat(variantBank, multigridBank).filter(function (item) {
      return (!selectedMode || item.mode === selectedMode) && (!difficulty || item.difficulty === difficulty);
    }).map(function (item) { return { id: item.id, mode: item.mode, difficulty: item.difficulty,
      rating: item.rating || (legacyModes.indexOf(item.mode) >= 0 ? item.difficulty : "density-" + item.difficulty) }; });
  }

  function getSeedPuzzles() {
    return BANK.map(function (item) { return { id: item.id, mode: item.mode, difficulty: item.difficulty,
      givens: item.text.split("").map(Number), clues: normalizeClues(item.mode), rating: item.rating || item.difficulty }; }).concat(variantBank.concat(multigridBank).map(function(item){return {id:item.id,mode:item.mode,difficulty:item.difficulty,givens:(item.givens||item.text.split("").map(Number)).slice(),clues:normalizeClues(item.mode,item.clues),rating:"density-"+item.difficulty};}));
  }
  return { getLayout: getLayout, getCellLabel: getCellLabel, normalizeClues: normalizeClues, getConflicts: getConflicts, analyzeSolutions: analyzeSolutions, getRelatedCells: getRelatedCells, getPuzzle: getPuzzle, candidates: candidates, solve: solve, countSolutions: countSolutions,
    validateComplete: validateComplete, getHint: getHint, getSeedPuzzles: getSeedPuzzles, getPuzzleCatalog: getPuzzleCatalog,
    getModes: getModes, getDifficulties: getDifficulties, arePeers: arePeers,
    getCellDecorations: getCellDecorations,
    getUnits: function (mode) { return config(mode).units.map(function (unit) { return { cells: unit.cells.slice(), label: unit.label }; }); },
    getPeers: function (index, mode) { return config(mode).peers[index].slice(); } };
});
